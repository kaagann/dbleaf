use serde::{Deserialize, Serialize};

fn default_ssh_port() -> u16 {
    22
}

fn default_ssh_auth_method() -> String {
    "password".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: String,
    pub database: String,
    pub ssl_mode: bool,
    pub color: String,
    pub last_connected_at: Option<String>,
    pub created_at: String,
    // SSH Tunnel fields
    #[serde(default)]
    pub use_ssh_tunnel: bool,
    #[serde(default)]
    pub ssh_host: String,
    #[serde(default = "default_ssh_port")]
    pub ssh_port: u16,
    #[serde(default)]
    pub ssh_username: String,
    #[serde(default = "default_ssh_auth_method")]
    pub ssh_auth_method: String,
    #[serde(default)]
    pub ssh_password: String,
    #[serde(default)]
    pub ssh_key_path: String,
    #[serde(default)]
    pub ssh_passphrase: String,
}
