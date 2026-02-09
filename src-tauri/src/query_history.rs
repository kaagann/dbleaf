use serde::{Deserialize, Serialize};
use std::fs;

use crate::storage::get_storage_dir;

const MAX_HISTORY_ENTRIES: usize = 10_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct QueryHistoryEntry {
    pub id: String,
    pub sql: String,
    pub connection_id: String,
    pub connection_name: String,
    pub database: String,
    pub timestamp: String,
    pub duration_ms: u64,
    pub row_count: i64,
    pub success: bool,
    pub error_message: Option<String>,
    pub is_favorite: bool,
}

fn get_history_file() -> Result<std::path::PathBuf, String> {
    Ok(get_storage_dir()?.join("query_history.json"))
}

pub fn load_history() -> Result<Vec<QueryHistoryEntry>, String> {
    let path = get_history_file()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let json = fs::read_to_string(&path).map_err(|e| format!("Geçmiş dosya okuma hatası: {}", e))?;
    let entries: Vec<QueryHistoryEntry> =
        serde_json::from_str(&json).map_err(|e| format!("Geçmiş JSON parse hatası: {}", e))?;
    Ok(entries)
}

fn save_history(entries: &[QueryHistoryEntry]) -> Result<(), String> {
    let path = get_history_file()?;
    let json = serde_json::to_string_pretty(entries)
        .map_err(|e| format!("Geçmiş JSON serileştirme hatası: {}", e))?;
    fs::write(&path, json).map_err(|e| format!("Geçmiş dosya yazma hatası: {}", e))?;
    Ok(())
}

pub fn add_history_entry(entry: QueryHistoryEntry) -> Result<(), String> {
    let mut entries = load_history()?;

    // Add new entry at the beginning (newest first)
    entries.insert(0, entry);

    // Trim to max size — remove oldest non-favorite entries
    while entries.len() > MAX_HISTORY_ENTRIES {
        // Find last non-favorite entry to remove
        if let Some(pos) = entries.iter().rposition(|e| !e.is_favorite) {
            entries.remove(pos);
        } else {
            // All entries are favorites, remove the last one anyway
            entries.pop();
        }
    }

    save_history(&entries)
}

pub fn toggle_favorite(id: &str) -> Result<(), String> {
    let mut entries = load_history()?;
    if let Some(entry) = entries.iter_mut().find(|e| e.id == id) {
        entry.is_favorite = !entry.is_favorite;
        save_history(&entries)
    } else {
        Err(format!("Geçmiş kaydı bulunamadı: {}", id))
    }
}

pub fn delete_history_entry(id: &str) -> Result<(), String> {
    let mut entries = load_history()?;
    let len_before = entries.len();
    entries.retain(|e| e.id != id);
    if entries.len() == len_before {
        return Err(format!("Geçmiş kaydı bulunamadı: {}", id));
    }
    save_history(&entries)
}

pub fn clear_history() -> Result<(), String> {
    save_history(&[])
}
