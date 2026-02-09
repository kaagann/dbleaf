use ssh2::Session;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use crate::db::models::ConnectionConfig;

pub struct SshTunnel {
    pub local_port: u16,
    shutdown_tx: mpsc::Sender<()>,
    forward_handle: Option<thread::JoinHandle<()>>,
}

impl SshTunnel {
    pub fn establish(config: &ConnectionConfig) -> Result<Self, String> {
        // 1. TCP connection to SSH host
        let ssh_addr = format!("{}:{}", config.ssh_host, config.ssh_port);
        let tcp = TcpStream::connect_timeout(
            &ssh_addr
                .parse()
                .map_err(|e| format!("SSH adres hatası: {}", e))?,
            Duration::from_secs(10),
        )
        .map_err(|e| format!("SSH bağlantı hatası: {}", e))?;
        tcp.set_read_timeout(Some(Duration::from_secs(30))).ok();

        // 2. SSH session
        let mut session =
            Session::new().map_err(|e| format!("SSH oturum oluşturulamadı: {}", e))?;
        session.set_tcp_stream(tcp);
        session
            .handshake()
            .map_err(|e| format!("SSH el sıkışma hatası: {}", e))?;

        // 3. Authentication
        match config.ssh_auth_method.as_str() {
            "password" => {
                session
                    .userauth_password(&config.ssh_username, &config.ssh_password)
                    .map_err(|e| format!("SSH şifre doğrulama hatası: {}", e))?;
            }
            "key" => {
                session
                    .userauth_pubkey_file(
                        &config.ssh_username,
                        None,
                        std::path::Path::new(&config.ssh_key_path),
                        None,
                    )
                    .map_err(|e| format!("SSH anahtar doğrulama hatası: {}", e))?;
            }
            "key_passphrase" => {
                session
                    .userauth_pubkey_file(
                        &config.ssh_username,
                        None,
                        std::path::Path::new(&config.ssh_key_path),
                        Some(&config.ssh_passphrase),
                    )
                    .map_err(|e| format!("SSH anahtar+parola doğrulama hatası: {}", e))?;
            }
            other => {
                return Err(format!("Bilinmeyen SSH doğrulama yöntemi: {}", other));
            }
        }

        if !session.authenticated() {
            return Err("SSH doğrulama başarısız".to_string());
        }

        // 4. Bind local listener on random port
        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("Yerel port bağlama hatası: {}", e))?;
        let local_port = listener
            .local_addr()
            .map_err(|e| format!("Yerel adres alınamadı: {}", e))?
            .port();

        // Make listener non-blocking for shutdown checks
        listener
            .set_nonblocking(true)
            .map_err(|e| format!("Listener ayar hatası: {}", e))?;

        // 5. Background forwarding thread
        let (shutdown_tx, shutdown_rx) = mpsc::channel::<()>();
        let remote_host = config.host.clone();
        let remote_port = config.port;

        // Session needs to be moved into the thread
        let forward_handle = thread::spawn(move || {
            Self::forward_loop(session, listener, &remote_host, remote_port, shutdown_rx);
        });

        Ok(SshTunnel {
            local_port,
            shutdown_tx,
            forward_handle: Some(forward_handle),
        })
    }

    fn forward_loop(
        session: Session,
        listener: TcpListener,
        remote_host: &str,
        remote_port: u16,
        shutdown_rx: mpsc::Receiver<()>,
    ) {
        // Set session to non-blocking for the accept loop
        session.set_blocking(false);

        loop {
            // Check shutdown signal
            if shutdown_rx.try_recv().is_ok() {
                break;
            }

            match listener.accept() {
                Ok((local_stream, _)) => {
                    // Set session to blocking for channel operations
                    session.set_blocking(true);
                    // Open SSH channel to remote PG
                    match session.channel_direct_tcpip(remote_host, remote_port, None) {
                        Ok(channel) => {
                            // Bidirectional copy (blocks until connection closes)
                            Self::bidirectional_copy(&session, local_stream, channel);
                        }
                        Err(e) => {
                            eprintln!("SSH kanal hatası: {}", e);
                        }
                    }
                    // Back to non-blocking for accept loop
                    session.set_blocking(false);
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    // No connection yet, sleep briefly
                    thread::sleep(Duration::from_millis(50));
                }
                Err(e) => {
                    eprintln!("Listener accept hatası: {}", e);
                    break;
                }
            }
        }
    }

    fn bidirectional_copy(session: &Session, local_stream: TcpStream, mut channel: ssh2::Channel) {
        // Set local stream to non-blocking for polling
        local_stream.set_nonblocking(true).ok();

        let mut local_read = local_stream
            .try_clone()
            .expect("Failed to clone local stream");
        let mut local_write = local_stream;

        // Session controls channel blocking mode
        session.set_blocking(false);

        let mut local_buf = [0u8; 8192];
        let mut channel_buf = [0u8; 8192];

        loop {
            let mut did_work = false;

            // Local -> Channel
            match local_read.read(&mut local_buf) {
                Ok(0) => break, // local closed
                Ok(n) => {
                    // Temporarily set blocking for write
                    session.set_blocking(true);
                    if channel.write_all(&local_buf[..n]).is_err() {
                        break;
                    }
                    channel.flush().ok();
                    session.set_blocking(false);
                    did_work = true;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(_) => break,
            }

            // Channel -> Local
            match channel.read(&mut channel_buf) {
                Ok(0) => break, // channel closed
                Ok(n) => {
                    if local_write.write_all(&channel_buf[..n]).is_err() {
                        break;
                    }
                    local_write.flush().ok();
                    did_work = true;
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {}
                Err(_) => break,
            }

            // Check if channel EOF
            if channel.eof() {
                break;
            }

            if !did_work {
                thread::sleep(Duration::from_millis(1));
            }
        }

        // Cleanup
        session.set_blocking(true);
        channel.send_eof().ok();
        channel.wait_close().ok();
    }

    pub fn shutdown(mut self) {
        let _ = self.shutdown_tx.send(());
        if let Some(handle) = self.forward_handle.take() {
            // Give the thread a moment to finish
            let _ = handle.join();
        }
    }
}
