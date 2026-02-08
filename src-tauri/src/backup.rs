use serde::{Deserialize, Serialize};
use std::process::Command;

use crate::db::models::ConnectionConfig;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupResult {
    pub success: bool,
    pub message: String,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreResult {
    pub success: bool,
    pub message: String,
}

fn find_pg_bin(name: &str) -> Result<String, String> {
    // Try common paths for pg_dump/pg_restore/psql
    let candidates = vec![
        // Homebrew keg-only (libpq)
        format!("/opt/homebrew/opt/libpq/bin/{}", name),
        // Homebrew linked
        format!("/opt/homebrew/bin/{}", name),
        // Intel Mac Homebrew
        format!("/usr/local/opt/libpq/bin/{}", name),
        format!("/usr/local/bin/{}", name),
        // Postgres.app
        format!("/Applications/Postgres.app/Contents/Versions/latest/bin/{}", name),
        // System
        format!("/usr/bin/{}", name),
        // Linux PostgreSQL
        format!("/usr/lib/postgresql/17/bin/{}", name),
        format!("/usr/lib/postgresql/16/bin/{}", name),
        format!("/usr/lib/postgresql/15/bin/{}", name),
        format!("/usr/lib/postgresql/14/bin/{}", name),
        // Fallback: try PATH
        name.to_string(),
    ];

    for path in &candidates {
        if let Ok(output) = Command::new(path).arg("--version").output() {
            if output.status.success() {
                return Ok(path.clone());
            }
        }
    }

    Err(format!(
        "'{}' bulunamadı. PostgreSQL istemci araçlarının yüklü olduğundan emin olun.",
        name
    ))
}

pub fn backup_database(
    config: &ConnectionConfig,
    format: &str,
    output_path: &str,
) -> Result<BackupResult, String> {
    let pg_dump = find_pg_bin("pg_dump")?;

    let format_flag = match format {
        "custom" => "c",
        "tar" => "t",
        "sql" => "p",
        _ => "p",
    };

    let mut cmd = Command::new(&pg_dump);
    cmd.arg("-h").arg(&config.host)
        .arg("-p").arg(config.port.to_string())
        .arg("-U").arg(&config.username)
        .arg("-d").arg(&config.database)
        .arg("-F").arg(format_flag)
        .arg("-f").arg(output_path)
        .arg("--verbose");

    if !config.ssl_mode {
        cmd.env("PGSSLMODE", "disable");
    } else {
        cmd.env("PGSSLMODE", "require");
    }

    cmd.env("PGPASSWORD", &config.password);

    let output = cmd.output().map_err(|e| format!("pg_dump çalıştırılamadı: {}", e))?;

    if output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Ok(BackupResult {
            success: true,
            message: format!("Yedekleme başarılı.\n{}", stderr),
            file_path: output_path.to_string(),
        })
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("pg_dump hatası:\n{}", stderr))
    }
}

pub fn restore_database(
    config: &ConnectionConfig,
    input_path: &str,
) -> Result<RestoreResult, String> {
    // Detect format by extension
    let is_sql = input_path.ends_with(".sql");

    if is_sql {
        // Use psql for plain SQL files
        let psql = find_pg_bin("psql")?;

        let mut cmd = Command::new(&psql);
        cmd.arg("-h").arg(&config.host)
            .arg("-p").arg(config.port.to_string())
            .arg("-U").arg(&config.username)
            .arg("-d").arg(&config.database)
            .arg("-f").arg(input_path);

        if !config.ssl_mode {
            cmd.env("PGSSLMODE", "disable");
        } else {
            cmd.env("PGSSLMODE", "require");
        }
        cmd.env("PGPASSWORD", &config.password);

        let output = cmd.output().map_err(|e| format!("psql çalıştırılamadı: {}", e))?;

        if output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Ok(RestoreResult {
                success: true,
                message: format!("Geri yükleme başarılı.\n{}", stderr),
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("psql hatası:\n{}", stderr))
        }
    } else {
        // Use pg_restore for custom/tar formats
        let pg_restore = find_pg_bin("pg_restore")?;

        let mut cmd = Command::new(&pg_restore);
        cmd.arg("-h").arg(&config.host)
            .arg("-p").arg(config.port.to_string())
            .arg("-U").arg(&config.username)
            .arg("-d").arg(&config.database)
            .arg("--verbose")
            .arg(input_path);

        if !config.ssl_mode {
            cmd.env("PGSSLMODE", "disable");
        } else {
            cmd.env("PGSSLMODE", "require");
        }
        cmd.env("PGPASSWORD", &config.password);

        let output = cmd.output().map_err(|e| format!("pg_restore çalıştırılamadı: {}", e))?;

        if output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Ok(RestoreResult {
                success: true,
                message: format!("Geri yükleme başarılı.\n{}", stderr),
            })
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("pg_restore hatası:\n{}", stderr))
        }
    }
}
