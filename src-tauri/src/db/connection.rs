use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_postgres::{Client, NoTls};
use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;

use super::models::ConnectionConfig;

pub struct ConnectionManager {
    connections: HashMap<String, Arc<Client>>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: HashMap::new(),
        }
    }

    fn build_connection_string(config: &ConnectionConfig) -> String {
        format!(
            "host={} port={} user={} password={} dbname={} {}",
            config.host,
            config.port,
            config.username,
            config.password,
            if config.database.is_empty() { "postgres" } else { &config.database },
            if config.ssl_mode { "sslmode=require" } else { "" }
        )
    }

    pub async fn test_connection(config: &ConnectionConfig) -> Result<String, String> {
        let conn_str = Self::build_connection_string(config);

        if config.ssl_mode {
            let connector = TlsConnector::builder()
                .danger_accept_invalid_certs(true)
                .build()
                .map_err(|e| format!("TLS hatası: {}", e))?;
            let tls = MakeTlsConnector::new(connector);

            let (client, connection) = tokio_postgres::connect(&conn_str, tls)
                .await
                .map_err(|e| format!("Bağlantı hatası: {}", e))?;

            tokio::spawn(async move {
                if let Err(e) = connection.await {
                    eprintln!("Bağlantı hatası: {}", e);
                }
            });

            let row = client
                .query_one("SELECT version()", &[])
                .await
                .map_err(|e| format!("Sorgu hatası: {}", e))?;

            let version: String = row.get(0);
            Ok(version)
        } else {
            let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
                .await
                .map_err(|e| format!("Bağlantı hatası: {}", e))?;

            tokio::spawn(async move {
                if let Err(e) = connection.await {
                    eprintln!("Bağlantı hatası: {}", e);
                }
            });

            let row = client
                .query_one("SELECT version()", &[])
                .await
                .map_err(|e| format!("Sorgu hatası: {}", e))?;

            let version: String = row.get(0);
            Ok(version)
        }
    }

    pub async fn connect(&mut self, config: &ConnectionConfig) -> Result<String, String> {
        let conn_str = Self::build_connection_string(config);

        if config.ssl_mode {
            let connector = TlsConnector::builder()
                .danger_accept_invalid_certs(true)
                .build()
                .map_err(|e| format!("TLS hatası: {}", e))?;
            let tls = MakeTlsConnector::new(connector);

            let (client, connection) = tokio_postgres::connect(&conn_str, tls)
                .await
                .map_err(|e| format!("Bağlantı hatası: {}", e))?;

            tokio::spawn(async move {
                if let Err(e) = connection.await {
                    eprintln!("Bağlantı hatası: {}", e);
                }
            });

            self.connections.insert(config.id.clone(), Arc::new(client));
        } else {
            let (client, connection) = tokio_postgres::connect(&conn_str, NoTls)
                .await
                .map_err(|e| format!("Bağlantı hatası: {}", e))?;

            tokio::spawn(async move {
                if let Err(e) = connection.await {
                    eprintln!("Bağlantı hatası: {}", e);
                }
            });

            self.connections.insert(config.id.clone(), Arc::new(client));
        }

        Ok(config.id.clone())
    }

    pub fn disconnect(&mut self, connection_id: &str) -> Result<(), String> {
        self.connections.remove(connection_id);
        Ok(())
    }

    pub fn get_client(&self, connection_id: &str) -> Result<Arc<Client>, String> {
        self.connections
            .get(connection_id)
            .cloned()
            .ok_or_else(|| format!("Bağlantı bulunamadı: {}", connection_id))
    }
}

pub type AppConnectionManager = Arc<Mutex<ConnectionManager>>;

pub fn create_connection_manager() -> AppConnectionManager {
    Arc::new(Mutex::new(ConnectionManager::new()))
}
