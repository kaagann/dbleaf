use std::fs;
use std::path::PathBuf;

use crate::db::models::ConnectionConfig;

fn get_storage_dir() -> Result<PathBuf, String> {
    let dir = dirs::data_dir()
        .ok_or("Veri dizini bulunamadı")?
        .join("pg-manager");
    fs::create_dir_all(&dir).map_err(|e| format!("Dizin oluşturulamadı: {}", e))?;
    Ok(dir)
}

fn get_connections_file() -> Result<PathBuf, String> {
    Ok(get_storage_dir()?.join("connections.json"))
}

pub fn save_connections(connections: &[ConnectionConfig]) -> Result<(), String> {
    let path = get_connections_file()?;
    let json = serde_json::to_string_pretty(connections)
        .map_err(|e| format!("JSON serileştirme hatası: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Dosya yazma hatası: {}", e))?;
    Ok(())
}

pub fn load_connections() -> Result<Vec<ConnectionConfig>, String> {
    let path = get_connections_file()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let json = fs::read_to_string(&path).map_err(|e| format!("Dosya okuma hatası: {}", e))?;
    let connections: Vec<ConnectionConfig> =
        serde_json::from_str(&json).map_err(|e| format!("JSON parse hatası: {}", e))?;
    Ok(connections)
}
