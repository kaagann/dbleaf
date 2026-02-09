use std::sync::Arc;

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tokio_postgres::Client;

use crate::db::queries;
use crate::storage::get_storage_dir;

// ── Settings ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSettings {
    pub api_key: String,
    pub model: String,
}

impl Default for AiSettings {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            model: "gpt-4o-mini".to_string(),
        }
    }
}

fn get_ai_settings_file() -> Result<std::path::PathBuf, String> {
    Ok(get_storage_dir()?.join("ai_settings.json"))
}

pub fn save_ai_settings(settings: &AiSettings) -> Result<(), String> {
    let path = get_ai_settings_file()?;
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("AI ayarları serileştirme hatası: {}", e))?;
    std::fs::write(&path, json).map_err(|e| format!("AI ayarları yazma hatası: {}", e))?;
    Ok(())
}

pub fn load_ai_settings() -> Result<AiSettings, String> {
    let path = get_ai_settings_file()?;
    if !path.exists() {
        return Ok(AiSettings::default());
    }
    let json =
        std::fs::read_to_string(&path).map_err(|e| format!("AI ayarları okuma hatası: {}", e))?;
    serde_json::from_str(&json).map_err(|e| format!("AI ayarları parse hatası: {}", e))
}

// ── Chat message types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: Option<String>,
    pub tool_calls: Option<Vec<ToolCall>>,
    pub tool_call_id: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub id: String,
    #[serde(rename = "type")]
    pub call_type: String,
    pub function: FunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

// ── Streaming events ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AiStreamEvent {
    #[serde(rename = "token")]
    Token { content: String },
    #[serde(rename = "tool_call_start")]
    ToolCallStart { id: String, name: String },
    #[serde(rename = "tool_call_args")]
    ToolCallArgs { id: String, args_delta: String },
    #[serde(rename = "tool_result")]
    ToolResult {
        id: String,
        name: String,
        result: String,
    },
    #[serde(rename = "done")]
    Done { message: ChatMessage },
    #[serde(rename = "error")]
    Error { message: String },
}

// ── SQL Security Layer ──

fn validate_readonly_sql(sql: &str) -> Result<(), String> {
    let upper = sql.trim().to_uppercase();
    let forbidden = [
        "INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "GRANT", "REVOKE",
        "COPY", "VACUUM", "REINDEX", "CLUSTER", "COMMENT",
    ];

    for keyword in &forbidden {
        if upper.starts_with(keyword) {
            return Err(format!(
                "Güvenlik: '{}' komutu yasak. Sadece SELECT sorguları çalıştırılabilir.",
                keyword
            ));
        }
        // Check for DML in subqueries/CTEs
        if upper.contains(&format!(";{}", keyword))
            || upper.contains(&format!("; {}", keyword))
        {
            return Err(format!(
                "Güvenlik: '{}' komutu tespit edildi. Sadece okuma sorguları çalıştırılabilir.",
                keyword
            ));
        }
    }
    Ok(())
}

async fn execute_readonly_query(
    client: &Arc<Client>,
    sql: &str,
    max_rows: i64,
) -> Result<serde_json::Value, String> {
    validate_readonly_sql(sql)?;

    client
        .execute("SET statement_timeout = '30s'", &[])
        .await
        .map_err(|e| format!("Timeout ayarlanamadı: {}", e))?;

    client
        .execute("BEGIN READ ONLY", &[])
        .await
        .map_err(|e| format!("Transaction başlatılamadı: {}", e))?;

    let result = async {
        let trimmed = sql.trim().trim_end_matches(';');
        let upper = trimmed.to_uppercase();
        let query = if !upper.contains("LIMIT") {
            format!("{} LIMIT {}", trimmed, max_rows)
        } else {
            trimmed.to_string()
        };

        let rows = client
            .query(&query as &str, &[])
            .await
            .map_err(|e| format!("Sorgu hatası: {}", e))?;

        let columns: Vec<String> = if !rows.is_empty() {
            rows[0]
                .columns()
                .iter()
                .map(|c| c.name().to_string())
                .collect()
        } else {
            vec![]
        };

        let json_rows: Vec<serde_json::Value> = rows
            .iter()
            .map(|row| {
                let mut obj = serde_json::Map::new();
                for (idx, col) in row.columns().iter().enumerate() {
                    obj.insert(
                        col.name().to_string(),
                        queries::pg_value_to_json(row, idx, col.type_()),
                    );
                }
                serde_json::Value::Object(obj)
            })
            .collect();

        Ok(serde_json::json!({
            "columns": columns,
            "rows": json_rows,
            "row_count": json_rows.len()
        }))
    }
    .await;

    client.execute("ROLLBACK", &[]).await.ok();
    client.execute("RESET statement_timeout", &[]).await.ok();

    result
}

// ── Database stats ──

async fn get_database_stats(client: &Arc<Client>) -> Result<serde_json::Value, String> {
    let db_size_row = client
        .query_one(
            "SELECT pg_size_pretty(pg_database_size(current_database())), current_database()",
            &[],
        )
        .await
        .map_err(|e| format!("DB boyutu alınamadı: {}", e))?;

    let db_size: String = db_size_row.get(0);
    let db_name: String = db_size_row.get(1);

    let rows = client
        .query(
            "SELECT schemaname, relname,
                    pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) as total_size,
                    n_live_tup as estimated_rows
             FROM pg_stat_user_tables
             ORDER BY pg_total_relation_size(schemaname || '.' || relname) DESC
             LIMIT 50",
            &[],
        )
        .await
        .map_err(|e| format!("Tablo istatistikleri alınamadı: {}", e))?;

    let tables: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "schema": row.get::<_, String>(0),
                "table": row.get::<_, String>(1),
                "total_size": row.get::<_, String>(2),
                "estimated_rows": row.get::<_, i64>(3)
            })
        })
        .collect();

    Ok(serde_json::json!({
        "database": db_name,
        "size": db_size,
        "tables": tables
    }))
}

// ── OpenAI tool definitions ──

fn get_tool_definitions() -> serde_json::Value {
    serde_json::json!([
        {
            "type": "function",
            "function": {
                "name": "list_databases",
                "description": "List all databases on the PostgreSQL server with their owners, encodings, and sizes",
                "parameters": { "type": "object", "properties": {}, "required": [] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "list_tables",
                "description": "List all tables and views in a schema with their types and estimated row counts",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "schema": { "type": "string", "description": "Schema name (default: public)" }
                    },
                    "required": []
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "describe_table",
                "description": "Get detailed table structure including columns (names, types, nullability, defaults, primary keys) and indexes",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "schema": { "type": "string", "description": "Schema name (default: public)" },
                        "table": { "type": "string", "description": "Table name" }
                    },
                    "required": ["table"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_table_relations",
                "description": "Get foreign key relationships for a table",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "schema": { "type": "string", "description": "Schema name (default: public)" },
                        "table": { "type": "string", "description": "Table name" }
                    },
                    "required": ["table"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "execute_readonly_query",
                "description": "Execute a read-only SQL query. Only SELECT queries are allowed. Results are limited to 500 rows. Use this for data analysis, aggregations, and data exploration.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "sql": { "type": "string", "description": "SQL SELECT query to execute" }
                    },
                    "required": ["sql"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_database_stats",
                "description": "Get database statistics including database size and table sizes/row counts",
                "parameters": { "type": "object", "properties": {}, "required": [] }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_table_sample",
                "description": "Get sample rows from a table to understand its data",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "schema": { "type": "string", "description": "Schema name (default: public)" },
                        "table": { "type": "string", "description": "Table name" },
                        "limit": { "type": "integer", "description": "Number of rows (default: 5, max: 20)" }
                    },
                    "required": ["table"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_table_indexes",
                "description": "Get all indexes for a specific table",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "schema": { "type": "string", "description": "Schema name (default: public)" },
                        "table": { "type": "string", "description": "Table name" }
                    },
                    "required": ["table"]
                }
            }
        }
    ])
}

// ── Tool execution ──

async fn execute_tool(
    client: &Arc<Client>,
    tool_name: &str,
    args: &serde_json::Value,
) -> Result<String, String> {
    match tool_name {
        "list_databases" => {
            let dbs = queries::list_databases(client).await?;
            serde_json::to_string(&dbs).map_err(|e| e.to_string())
        }
        "list_tables" => {
            let schema = args
                .get("schema")
                .and_then(|v| v.as_str())
                .unwrap_or("public");
            let tables = queries::list_tables(client, schema).await?;
            serde_json::to_string(&tables).map_err(|e| e.to_string())
        }
        "describe_table" => {
            let schema = args
                .get("schema")
                .and_then(|v| v.as_str())
                .unwrap_or("public");
            let table = args
                .get("table")
                .and_then(|v| v.as_str())
                .ok_or("'table' parametresi gerekli")?;
            let columns = queries::list_columns(client, schema, table).await?;
            let indexes = queries::list_indexes(client, schema, table).await?;
            serde_json::to_string(&serde_json::json!({
                "columns": columns,
                "indexes": indexes
            }))
            .map_err(|e| e.to_string())
        }
        "get_table_relations" => {
            let schema = args
                .get("schema")
                .and_then(|v| v.as_str())
                .unwrap_or("public");
            let table = args
                .get("table")
                .and_then(|v| v.as_str())
                .ok_or("'table' parametresi gerekli")?;
            let fks = queries::list_foreign_keys(client, schema, table).await?;
            serde_json::to_string(&fks).map_err(|e| e.to_string())
        }
        "execute_readonly_query" => {
            let sql_str = args
                .get("sql")
                .and_then(|v| v.as_str())
                .ok_or("'sql' parametresi gerekli")?;
            let result = execute_readonly_query(client, sql_str, 500).await?;
            serde_json::to_string(&result).map_err(|e| e.to_string())
        }
        "get_database_stats" => {
            let stats = get_database_stats(client).await?;
            serde_json::to_string(&stats).map_err(|e| e.to_string())
        }
        "get_table_sample" => {
            let schema = args
                .get("schema")
                .and_then(|v| v.as_str())
                .unwrap_or("public");
            let table = args
                .get("table")
                .and_then(|v| v.as_str())
                .ok_or("'table' parametresi gerekli")?;
            let limit = args
                .get("limit")
                .and_then(|v| v.as_i64())
                .unwrap_or(5)
                .min(20);
            let sql_str = format!(
                "SELECT * FROM \"{}\".\"{}\" LIMIT {}",
                schema, table, limit
            );
            let result = execute_readonly_query(client, &sql_str, limit).await?;
            serde_json::to_string(&result).map_err(|e| e.to_string())
        }
        "get_table_indexes" => {
            let schema = args
                .get("schema")
                .and_then(|v| v.as_str())
                .unwrap_or("public");
            let table = args
                .get("table")
                .and_then(|v| v.as_str())
                .ok_or("'table' parametresi gerekli")?;
            let indexes = queries::list_indexes(client, schema, table).await?;
            serde_json::to_string(&indexes).map_err(|e| e.to_string())
        }
        _ => Err(format!("Bilinmeyen araç: {}", tool_name)),
    }
}

// ── Main chat function ──

pub async fn ai_chat(
    client: &Arc<Client>,
    messages: Vec<ChatMessage>,
    settings: &AiSettings,
    db_context: &str,
    channel: Channel<AiStreamEvent>,
) -> Result<(), String> {
    if settings.api_key.is_empty() {
        return Err("API anahtarı ayarlanmamış".to_string());
    }

    let http_client = reqwest::Client::new();

    let system_message = ChatMessage {
        role: "system".to_string(),
        content: Some(format!(
            "You are a PostgreSQL database assistant integrated into PG Manager, a desktop database management tool. \
             You help users understand their database structure, write queries, analyze data, and troubleshoot issues.\n\n\
             Current database context:\n{}\n\n\
             Guidelines:\n\
             - Use the provided tools to explore the database before answering questions about data or structure\n\
             - CRITICAL: PostgreSQL folds unquoted identifiers to lowercase. If a column or table was created with camelCase or mixed case (e.g. \"createdAt\", \"userId\"), you MUST wrap it in double quotes in SQL: \"createdAt\", \"userId\". Always use the describe_table tool first to check exact column names, then quote any non-lowercase identifiers.\n\
             - You can only run read-only SELECT queries. No modifications are possible.\n\
             - Keep responses concise and focused\n\
             - When showing SQL, use proper formatting with ```sql code blocks\n\
             - Results are limited to 500 rows\n\
             - Respond in the same language the user uses",
            db_context
        )),
        tool_calls: None,
        tool_call_id: None,
        name: None,
    };

    let mut all_messages = vec![system_message];
    all_messages.extend(messages);

    // Conversation loop — handles multiple rounds of tool calls
    loop {
        let request_body = serde_json::json!({
            "model": settings.model,
            "messages": all_messages,
            "tools": get_tool_definitions(),
            "stream": true,
        });

        let response = http_client
            .post("https://api.openai.com/v1/chat/completions")
            .header("Authorization", format!("Bearer {}", settings.api_key))
            .header("Content-Type", "application/json")
            .json(&request_body)
            .send()
            .await
            .map_err(|e| format!("API isteği başarısız: {}", e))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("OpenAI API hatası ({}): {}", status, body));
        }

        // Parse streaming SSE response
        let mut accumulated_content = String::new();
        let mut tool_calls: Vec<ToolCall> = Vec::new();
        let mut buffer = String::new();

        let mut stream = response.bytes_stream();

        while let Some(chunk_result) = stream.next().await {
            let chunk = chunk_result.map_err(|e| format!("Stream hatası: {}", e))?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(line_end) = buffer.find('\n') {
                let line = buffer[..line_end].trim().to_string();
                buffer = buffer[line_end + 1..].to_string();

                if line.is_empty() || line == "data: [DONE]" {
                    continue;
                }

                if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(choices) = parsed.get("choices").and_then(|c| c.as_array()) {
                            if let Some(delta) =
                                choices.first().and_then(|c| c.get("delta"))
                            {
                                // Content tokens
                                if let Some(content) =
                                    delta.get("content").and_then(|c| c.as_str())
                                {
                                    accumulated_content.push_str(content);
                                    channel
                                        .send(AiStreamEvent::Token {
                                            content: content.to_string(),
                                        })
                                        .ok();
                                }

                                // Tool calls
                                if let Some(tc_arr) =
                                    delta.get("tool_calls").and_then(|t| t.as_array())
                                {
                                    for tc in tc_arr {
                                        let idx = tc
                                            .get("index")
                                            .and_then(|i| i.as_u64())
                                            .unwrap_or(0)
                                            as usize;

                                        // Ensure vec is large enough
                                        while tool_calls.len() <= idx {
                                            tool_calls.push(ToolCall {
                                                id: String::new(),
                                                call_type: "function".to_string(),
                                                function: FunctionCall {
                                                    name: String::new(),
                                                    arguments: String::new(),
                                                },
                                            });
                                        }

                                        if let Some(id) =
                                            tc.get("id").and_then(|i| i.as_str())
                                        {
                                            tool_calls[idx].id = id.to_string();
                                        }

                                        if let Some(func) = tc.get("function") {
                                            if let Some(name) =
                                                func.get("name").and_then(|n| n.as_str())
                                            {
                                                tool_calls[idx].function.name =
                                                    name.to_string();
                                                channel
                                                    .send(AiStreamEvent::ToolCallStart {
                                                        id: tool_calls[idx].id.clone(),
                                                        name: name.to_string(),
                                                    })
                                                    .ok();
                                            }
                                            if let Some(args) = func
                                                .get("arguments")
                                                .and_then(|a| a.as_str())
                                            {
                                                tool_calls[idx]
                                                    .function
                                                    .arguments
                                                    .push_str(args);
                                                channel
                                                    .send(AiStreamEvent::ToolCallArgs {
                                                        id: tool_calls[idx].id.clone(),
                                                        args_delta: args.to_string(),
                                                    })
                                                    .ok();
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // If tool calls, execute them and continue the loop
        if !tool_calls.is_empty() {
            all_messages.push(ChatMessage {
                role: "assistant".to_string(),
                content: if accumulated_content.is_empty() {
                    None
                } else {
                    Some(accumulated_content.clone())
                },
                tool_calls: Some(tool_calls.clone()),
                tool_call_id: None,
                name: None,
            });

            for tc in &tool_calls {
                let args: serde_json::Value =
                    serde_json::from_str(&tc.function.arguments).unwrap_or(serde_json::json!({}));

                let result = match execute_tool(client, &tc.function.name, &args).await {
                    Ok(r) => r,
                    Err(e) => format!("Hata: {}", e),
                };

                channel
                    .send(AiStreamEvent::ToolResult {
                        id: tc.id.clone(),
                        name: tc.function.name.clone(),
                        result: result.clone(),
                    })
                    .ok();

                all_messages.push(ChatMessage {
                    role: "tool".to_string(),
                    content: Some(result),
                    tool_calls: None,
                    tool_call_id: Some(tc.id.clone()),
                    name: Some(tc.function.name.clone()),
                });
            }

            // Reset for next round
            continue;
        }

        // No tool calls — done
        let final_message = ChatMessage {
            role: "assistant".to_string(),
            content: Some(accumulated_content),
            tool_calls: None,
            tool_call_id: None,
            name: None,
        };

        channel
            .send(AiStreamEvent::Done {
                message: final_message,
            })
            .ok();
        break;
    }

    Ok(())
}
