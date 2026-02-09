use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_postgres::{Client, NoTls};
use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;

use super::models::ConnectionConfig;
use crate::ssh_tunnel::SshTunnel;

pub struct ConnectionManager {
    connections: HashMap<String, Arc<Client>>,
    ssh_tunnels: HashMap<String, SshTunnel>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: HashMap::new(),
            ssh_tunnels: HashMap::new(),
        }
    }

    fn build_connection_string(config: &ConnectionConfig, tunnel_port: Option<u16>) -> String {
        let (host, port) = if let Some(lp) = tunnel_port {
            ("127.0.0.1".to_string(), lp)
        } else {
            (config.host.clone(), config.port)
        };

        format!(
            "host={} port={} user={} password={} dbname={} {}",
            host,
            port,
            config.username,
            config.password,
            if config.database.is_empty() { "postgres" } else { &config.database },
            if config.ssl_mode { "sslmode=require" } else { "" }
        )
    }

    async fn connect_pg(conn_str: &str, ssl_mode: bool) -> Result<(Client, tokio::task::JoinHandle<()>), String> {
        if ssl_mode {
            let connector = TlsConnector::builder()
                .danger_accept_invalid_certs(true)
                .build()
                .map_err(|e| format!("TLS hatası: {}", e))?;
            let tls = MakeTlsConnector::new(connector);

            let (client, connection) = tokio_postgres::connect(conn_str, tls)
                .await
                .map_err(|e| format!("Bağlantı hatası: {}", e))?;

            let handle = tokio::spawn(async move {
                if let Err(e) = connection.await {
                    eprintln!("Bağlantı hatası: {}", e);
                }
            });

            Ok((client, handle))
        } else {
            let (client, connection) = tokio_postgres::connect(conn_str, NoTls)
                .await
                .map_err(|e| format!("Bağlantı hatası: {}", e))?;

            let handle = tokio::spawn(async move {
                if let Err(e) = connection.await {
                    eprintln!("Bağlantı hatası: {}", e);
                }
            });

            Ok((client, handle))
        }
    }

    pub async fn test_connection(config: &ConnectionConfig) -> Result<String, String> {
        // If SSH tunnel, establish a temporary one
        let tunnel = if config.use_ssh_tunnel {
            let config_clone = config.clone();
            let t = tokio::task::spawn_blocking(move || SshTunnel::establish(&config_clone))
                .await
                .map_err(|e| format!("SSH görev hatası: {}", e))??;
            Some(t)
        } else {
            None
        };

        let tunnel_port = tunnel.as_ref().map(|t| t.local_port);
        let conn_str = Self::build_connection_string(config, tunnel_port);

        let result = async {
            let (client, _handle) = Self::connect_pg(&conn_str, config.ssl_mode).await?;

            let row = client
                .query_one("SELECT version()", &[])
                .await
                .map_err(|e| format!("Sorgu hatası: {}", e))?;

            let version: String = row.get(0);
            Ok(version)
        }
        .await;

        // Shutdown temporary tunnel
        if let Some(t) = tunnel {
            tokio::task::spawn_blocking(move || t.shutdown())
                .await
                .ok();
        }

        result
    }

    pub async fn connect(&mut self, config: &ConnectionConfig) -> Result<String, String> {
        // If SSH tunnel, establish it
        let tunnel_port = if config.use_ssh_tunnel {
            let config_clone = config.clone();
            let tunnel = tokio::task::spawn_blocking(move || SshTunnel::establish(&config_clone))
                .await
                .map_err(|e| format!("SSH görev hatası: {}", e))??;

            let port = tunnel.local_port;
            self.ssh_tunnels.insert(config.id.clone(), tunnel);
            Some(port)
        } else {
            None
        };

        let conn_str = Self::build_connection_string(config, tunnel_port);

        match Self::connect_pg(&conn_str, config.ssl_mode).await {
            Ok((client, _handle)) => {
                self.connections.insert(config.id.clone(), Arc::new(client));
                Ok(config.id.clone())
            }
            Err(e) => {
                // Clean up SSH tunnel on PG connection failure
                if let Some(tunnel) = self.ssh_tunnels.remove(&config.id) {
                    tokio::task::spawn_blocking(move || tunnel.shutdown())
                        .await
                        .ok();
                }
                Err(e)
            }
        }
    }

    pub fn disconnect(&mut self, connection_id: &str) -> Result<(), String> {
        self.connections.remove(connection_id);
        // Shutdown SSH tunnel if exists
        if let Some(tunnel) = self.ssh_tunnels.remove(connection_id) {
            tunnel.shutdown();
        }
        Ok(())
    }

    pub fn get_client(&self, connection_id: &str) -> Result<Arc<Client>, String> {
        self.connections
            .get(connection_id)
            .cloned()
            .ok_or_else(|| format!("Bağlantı bulunamadı: {}", connection_id))
    }

    pub fn get_tunnel_port(&self, connection_id: &str) -> Option<u16> {
        self.ssh_tunnels.get(connection_id).map(|t| t.local_port)
    }
}

pub type AppConnectionManager = Arc<Mutex<ConnectionManager>>;

pub fn create_connection_manager() -> AppConnectionManager {
    Arc::new(Mutex::new(ConnectionManager::new()))
}
