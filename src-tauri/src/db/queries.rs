use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::time::Instant;
use tokio_postgres::Client;
use tokio_postgres::types::Type;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaInfo {
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableInfo {
    pub name: String,
    pub schema: String,
    pub table_type: String, // "table" or "view"
    pub estimated_rows: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
    pub is_nullable: bool,
    pub column_default: Option<String>,
    pub is_primary_key: bool,
    pub ordinal_position: i32,
    pub udt_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexInfo {
    pub name: String,
    pub is_unique: bool,
    pub is_primary: bool,
    pub columns: String,
    pub index_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ForeignKeyInfo {
    pub name: String,
    pub column_name: String,
    pub foreign_table_schema: String,
    pub foreign_table_name: String,
    pub foreign_column_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FunctionInfo {
    pub name: String,
    pub schema: String,
    pub return_type: String,
    pub argument_types: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SequenceInfo {
    pub name: String,
    pub schema: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseInfo {
    pub name: String,
    pub owner: String,
    pub encoding: String,
    pub size: String,
}

pub async fn list_databases(client: &Arc<Client>) -> Result<Vec<DatabaseInfo>, String> {
    let rows = client
        .query(
            "SELECT
                d.datname as name,
                pg_catalog.pg_get_userbyid(d.datdba) as owner,
                pg_catalog.pg_encoding_to_char(d.encoding) as encoding,
                pg_catalog.pg_size_pretty(pg_catalog.pg_database_size(d.datname)) as size
             FROM pg_catalog.pg_database d
             WHERE d.datistemplate = false
             ORDER BY d.datname",
            &[],
        )
        .await
        .map_err(|e| format!("Veritabanı listesi alınamadı: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| DatabaseInfo {
            name: row.get(0),
            owner: row.get(1),
            encoding: row.get(2),
            size: row.get(3),
        })
        .collect())
}

pub async fn list_schemas(client: &Arc<Client>) -> Result<Vec<SchemaInfo>, String> {
    let rows = client
        .query(
            "SELECT schema_name FROM information_schema.schemata
             WHERE schema_name NOT IN ('pg_toast', 'pg_catalog', 'information_schema')
             ORDER BY schema_name",
            &[],
        )
        .await
        .map_err(|e| format!("Şema listesi alınamadı: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| SchemaInfo {
            name: row.get(0),
        })
        .collect())
}

pub async fn list_tables(client: &Arc<Client>, schema: &str) -> Result<Vec<TableInfo>, String> {
    let rows = client
        .query(
            "SELECT t.table_name, t.table_type,
                    COALESCE(s.n_live_tup, 0) as estimated_rows
             FROM information_schema.tables t
             LEFT JOIN pg_stat_user_tables s
                ON s.schemaname = t.table_schema AND s.relname = t.table_name
             WHERE t.table_schema = $1
                AND t.table_type IN ('BASE TABLE', 'VIEW')
             ORDER BY t.table_type, t.table_name",
            &[&schema],
        )
        .await
        .map_err(|e| format!("Tablo listesi alınamadı: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| {
            let table_type: String = row.get(1);
            TableInfo {
                name: row.get(0),
                schema: schema.to_string(),
                table_type: if table_type == "BASE TABLE" {
                    "table".to_string()
                } else {
                    "view".to_string()
                },
                estimated_rows: row.get::<_, i64>(2),
            }
        })
        .collect())
}

pub async fn list_columns(
    client: &Arc<Client>,
    schema: &str,
    table: &str,
) -> Result<Vec<ColumnInfo>, String> {
    let rows = client
        .query(
            "SELECT
                c.column_name,
                c.data_type,
                c.is_nullable = 'YES' as is_nullable,
                c.column_default,
                COALESCE(
                    (SELECT true FROM information_schema.table_constraints tc
                     JOIN information_schema.key_column_usage kcu
                        ON tc.constraint_name = kcu.constraint_name
                        AND tc.table_schema = kcu.table_schema
                     WHERE tc.constraint_type = 'PRIMARY KEY'
                        AND tc.table_schema = $1
                        AND tc.table_name = $2
                        AND kcu.column_name = c.column_name),
                    false
                ) as is_primary_key,
                c.ordinal_position::int,
                c.udt_name
             FROM information_schema.columns c
             WHERE c.table_schema = $1 AND c.table_name = $2
             ORDER BY c.ordinal_position",
            &[&schema, &table],
        )
        .await
        .map_err(|e| format!("Kolon listesi alınamadı: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| {
            let data_type: String = row.get(1);
            let udt_name: String = row.get(6);
            ColumnInfo {
                name: row.get(0),
                data_type: data_type.clone(),
                is_nullable: row.get(2),
                column_default: row.get(3),
                is_primary_key: row.get(4),
                ordinal_position: row.get(5),
                udt_name: if data_type == "USER-DEFINED" {
                    Some(udt_name)
                } else {
                    None
                },
            }
        })
        .collect())
}

pub async fn list_enum_values(
    client: &Arc<Client>,
    type_name: &str,
) -> Result<Vec<String>, String> {
    let rows = client
        .query(
            "SELECT e.enumlabel
             FROM pg_enum e
             JOIN pg_type t ON e.enumtypid = t.oid
             WHERE t.typname = $1
             ORDER BY e.enumsortorder",
            &[&type_name],
        )
        .await
        .map_err(|e| format_db_error(&e))?;

    Ok(rows.iter().map(|r| r.get::<_, String>(0)).collect())
}

pub async fn list_indexes(
    client: &Arc<Client>,
    schema: &str,
    table: &str,
) -> Result<Vec<IndexInfo>, String> {
    let rows = client
        .query(
            "SELECT
                i.relname as index_name,
                ix.indisunique as is_unique,
                ix.indisprimary as is_primary,
                string_agg(a.attname, ', ' ORDER BY array_position(ix.indkey, a.attnum)) as columns,
                am.amname as index_type
             FROM pg_index ix
             JOIN pg_class t ON t.oid = ix.indrelid
             JOIN pg_class i ON i.oid = ix.indexrelid
             JOIN pg_namespace n ON n.oid = t.relnamespace
             JOIN pg_am am ON am.oid = i.relam
             JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
             WHERE n.nspname = $1 AND t.relname = $2
             GROUP BY i.relname, ix.indisunique, ix.indisprimary, am.amname
             ORDER BY i.relname",
            &[&schema, &table],
        )
        .await
        .map_err(|e| format!("İndeks listesi alınamadı: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| IndexInfo {
            name: row.get(0),
            is_unique: row.get(1),
            is_primary: row.get(2),
            columns: row.get(3),
            index_type: row.get(4),
        })
        .collect())
}

pub async fn list_foreign_keys(
    client: &Arc<Client>,
    schema: &str,
    table: &str,
) -> Result<Vec<ForeignKeyInfo>, String> {
    let rows = client
        .query(
            "SELECT
                tc.constraint_name,
                kcu.column_name,
                ccu.table_schema as foreign_table_schema,
                ccu.table_name as foreign_table_name,
                ccu.column_name as foreign_column_name
             FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage kcu
                ON tc.constraint_name = kcu.constraint_name
                AND tc.table_schema = kcu.table_schema
             JOIN information_schema.constraint_column_usage ccu
                ON ccu.constraint_name = tc.constraint_name
                AND ccu.table_schema = tc.table_schema
             WHERE tc.constraint_type = 'FOREIGN KEY'
                AND tc.table_schema = $1
                AND tc.table_name = $2
             ORDER BY tc.constraint_name",
            &[&schema, &table],
        )
        .await
        .map_err(|e| format!("FK listesi alınamadı: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| ForeignKeyInfo {
            name: row.get(0),
            column_name: row.get(1),
            foreign_table_schema: row.get(2),
            foreign_table_name: row.get(3),
            foreign_column_name: row.get(4),
        })
        .collect())
}

pub async fn list_functions(
    client: &Arc<Client>,
    schema: &str,
) -> Result<Vec<FunctionInfo>, String> {
    let rows = client
        .query(
            "SELECT
                p.proname as name,
                n.nspname as schema,
                pg_get_function_result(p.oid) as return_type,
                pg_get_function_identity_arguments(p.oid) as argument_types
             FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = $1
                AND p.prokind = 'f'
             ORDER BY p.proname",
            &[&schema],
        )
        .await
        .map_err(|e| format!("Fonksiyon listesi alınamadı: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| FunctionInfo {
            name: row.get(0),
            schema: row.get(1),
            return_type: row.get(2),
            argument_types: row.get(3),
        })
        .collect())
}

pub async fn list_sequences(
    client: &Arc<Client>,
    schema: &str,
) -> Result<Vec<SequenceInfo>, String> {
    let rows = client
        .query(
            "SELECT sequence_name, sequence_schema
             FROM information_schema.sequences
             WHERE sequence_schema = $1
             ORDER BY sequence_name",
            &[&schema],
        )
        .await
        .map_err(|e| format!("Sequence listesi alınamadı: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| SequenceInfo {
            name: row.get(0),
            schema: row.get(1),
        })
        .collect())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableDataResult {
    pub columns: Vec<TableColumnMeta>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub total_rows: i64,
    pub page: i64,
    pub page_size: i64,
    pub execution_time_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TableColumnMeta {
    pub name: String,
    pub data_type: String,
}

fn pg_value_to_json(row: &tokio_postgres::Row, idx: usize, col_type: &Type) -> serde_json::Value {
    // Try to get the value as various types, fallback to text
    match *col_type {
        Type::BOOL => row
            .try_get::<_, Option<bool>>(idx)
            .ok()
            .flatten()
            .map(serde_json::Value::Bool)
            .unwrap_or(serde_json::Value::Null),
        Type::INT2 => row
            .try_get::<_, Option<i16>>(idx)
            .ok()
            .flatten()
            .map(|v| serde_json::Value::Number(v.into()))
            .unwrap_or(serde_json::Value::Null),
        Type::INT4 => row
            .try_get::<_, Option<i32>>(idx)
            .ok()
            .flatten()
            .map(|v| serde_json::Value::Number(v.into()))
            .unwrap_or(serde_json::Value::Null),
        Type::INT8 => row
            .try_get::<_, Option<i64>>(idx)
            .ok()
            .flatten()
            .map(|v| serde_json::Value::Number(v.into()))
            .unwrap_or(serde_json::Value::Null),
        Type::FLOAT4 => row
            .try_get::<_, Option<f32>>(idx)
            .ok()
            .flatten()
            .and_then(|v| serde_json::Number::from_f64(v as f64))
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        Type::FLOAT8 => row
            .try_get::<_, Option<f64>>(idx)
            .ok()
            .flatten()
            .and_then(|v| serde_json::Number::from_f64(v))
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        Type::JSON | Type::JSONB => row
            .try_get::<_, Option<serde_json::Value>>(idx)
            .ok()
            .flatten()
            .unwrap_or(serde_json::Value::Null),
        _ => {
            // Fallback: try as String
            row.try_get::<_, Option<String>>(idx)
                .ok()
                .flatten()
                .map(serde_json::Value::String)
                .unwrap_or(serde_json::Value::Null)
        }
    }
}

pub async fn query_table_data(
    client: &Arc<Client>,
    schema: &str,
    table: &str,
    page: i64,
    page_size: i64,
    sort_column: Option<String>,
    sort_direction: Option<String>,
) -> Result<TableDataResult, String> {
    let start = Instant::now();

    // Get total count
    let count_sql = format!(
        "SELECT COUNT(*) FROM \"{}\".\"{}\"",
        schema, table
    );
    let count_row = client
        .query_one(&count_sql, &[])
        .await
        .map_err(|e| format!("Satır sayısı alınamadı: {}", e))?;
    let total_rows: i64 = count_row.get(0);

    // Build query
    let offset = (page - 1) * page_size;
    let order_clause = match (&sort_column, &sort_direction) {
        (Some(col), Some(dir)) => {
            let direction = if dir == "desc" { "DESC" } else { "ASC" };
            format!("ORDER BY \"{}\" {} NULLS LAST", col, direction)
        }
        _ => String::new(),
    };

    let data_sql = format!(
        "SELECT * FROM \"{}\".\"{}\" {} LIMIT {} OFFSET {}",
        schema, table, order_clause, page_size, offset
    );

    let rows = client
        .query(&data_sql, &[])
        .await
        .map_err(|e| format!("Veri sorgulanamadı: {}", e))?;

    // Extract column info from first row or statement
    let columns: Vec<TableColumnMeta> = if !rows.is_empty() {
        rows[0]
            .columns()
            .iter()
            .map(|col| TableColumnMeta {
                name: col.name().to_string(),
                data_type: col.type_().name().to_string(),
            })
            .collect()
    } else {
        // Run a dummy query to get columns
        let col_rows = client
            .query(
                &format!(
                    "SELECT * FROM \"{}\".\"{}\" LIMIT 0",
                    schema, table
                ),
                &[],
            )
            .await
            .map_err(|e| format!("Kolon bilgisi alınamadı: {}", e))?;

        if let Some(stmt_cols) = col_rows.first() {
            stmt_cols
                .columns()
                .iter()
                .map(|col| TableColumnMeta {
                    name: col.name().to_string(),
                    data_type: col.type_().name().to_string(),
                })
                .collect()
        } else {
            Vec::new()
        }
    };

    // Convert rows to JSON values
    let json_rows: Vec<Vec<serde_json::Value>> = rows
        .iter()
        .map(|row| {
            row.columns()
                .iter()
                .enumerate()
                .map(|(idx, col)| pg_value_to_json(row, idx, col.type_()))
                .collect()
        })
        .collect();

    let execution_time_ms = start.elapsed().as_millis();

    Ok(TableDataResult {
        columns,
        rows: json_rows,
        total_rows,
        page,
        page_size,
        execution_time_ms,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecuteQueryResult {
    pub columns: Vec<TableColumnMeta>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub row_count: usize,
    pub execution_time_ms: u128,
    pub is_select: bool,
    pub affected_rows: Option<u64>,
}

fn format_db_error(e: &tokio_postgres::Error) -> String {
    if let Some(db_err) = e.as_db_error() {
        let mut msg = format!("HATA: {}", db_err.message());

        if let Some(detail) = db_err.detail() {
            msg.push_str(&format!("\nDetay: {}", detail));
        }
        if let Some(hint) = db_err.hint() {
            msg.push_str(&format!("\nİpucu: {}", hint));
        }
        if let Some(position) = db_err.position() {
            match position {
                tokio_postgres::error::ErrorPosition::Original(pos) => {
                    msg.push_str(&format!("\nKonum: karakter {}", pos));
                }
                tokio_postgres::error::ErrorPosition::Internal { position: pos, query } => {
                    msg.push_str(&format!("\nDahili konum: karakter {} ({})", pos, query));
                }
            }
        }
        let code = db_err.code().code();
        msg.push_str(&format!("\nKod: {}", code));

        msg
    } else {
        format!("Bağlantı hatası: {}", e)
    }
}

pub async fn execute_query(
    client: &Arc<Client>,
    sql: &str,
) -> Result<ExecuteQueryResult, String> {
    let start = Instant::now();
    let trimmed = sql.trim();

    // Check if it's a SELECT-like query (returns rows)
    let upper = trimmed.to_uppercase();
    let is_select = upper.starts_with("SELECT")
        || upper.starts_with("WITH")
        || upper.starts_with("TABLE")
        || upper.starts_with("VALUES")
        || upper.starts_with("SHOW")
        || upper.starts_with("EXPLAIN");

    if is_select {
        let rows = client
            .query(trimmed, &[])
            .await
            .map_err(|e| format_db_error(&e))?;

        let columns: Vec<TableColumnMeta> = if !rows.is_empty() {
            rows[0]
                .columns()
                .iter()
                .map(|col| TableColumnMeta {
                    name: col.name().to_string(),
                    data_type: col.type_().name().to_string(),
                })
                .collect()
        } else {
            Vec::new()
        };

        let json_rows: Vec<Vec<serde_json::Value>> = rows
            .iter()
            .map(|row| {
                row.columns()
                    .iter()
                    .enumerate()
                    .map(|(idx, col)| pg_value_to_json(row, idx, col.type_()))
                    .collect()
            })
            .collect();

        let row_count = json_rows.len();
        let execution_time_ms = start.elapsed().as_millis();

        Ok(ExecuteQueryResult {
            columns,
            rows: json_rows,
            row_count,
            execution_time_ms,
            is_select: true,
            affected_rows: None,
        })
    } else {
        let affected = client
            .execute(trimmed, &[])
            .await
            .map_err(|e| format_db_error(&e))?;

        let execution_time_ms = start.elapsed().as_millis();

        Ok(ExecuteQueryResult {
            columns: Vec::new(),
            rows: Vec::new(),
            row_count: 0,
            execution_time_ms,
            is_select: false,
            affected_rows: Some(affected),
        })
    }
}

// Autocomplete: returns all tables with their columns
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionSchema {
    pub tables: Vec<CompletionTable>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletionTable {
    pub schema: String,
    pub name: String,
    pub table_type: String,
    pub columns: Vec<String>,
}

pub async fn get_schema_completions(client: &Arc<Client>) -> Result<CompletionSchema, String> {
    let rows = client
        .query(
            "SELECT
                c.table_schema,
                c.table_name,
                t.table_type,
                c.column_name
             FROM information_schema.columns c
             JOIN information_schema.tables t
                ON t.table_schema = c.table_schema AND t.table_name = c.table_name
             WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                AND t.table_type IN ('BASE TABLE', 'VIEW')
             ORDER BY c.table_schema, c.table_name, c.ordinal_position",
            &[],
        )
        .await
        .map_err(|e| format!("Autocomplete verisi alınamadı: {}", e))?;

    let mut tables: Vec<CompletionTable> = Vec::new();
    let mut current_key = String::new();

    for row in &rows {
        let schema: String = row.get(0);
        let table_name: String = row.get(1);
        let table_type: String = row.get(2);
        let column_name: String = row.get(3);

        let key = format!("{}.{}", schema, table_name);
        if key != current_key {
            current_key = key;
            tables.push(CompletionTable {
                schema,
                name: table_name,
                table_type: if table_type == "BASE TABLE" {
                    "table".to_string()
                } else {
                    "view".to_string()
                },
                columns: vec![column_name],
            });
        } else if let Some(last) = tables.last_mut() {
            last.columns.push(column_name);
        }
    }

    Ok(CompletionSchema { tables })
}

// ── DML Operations (parameterized queries) ──────────────────────────────

pub async fn update_row(
    client: &Arc<Client>,
    schema: &str,
    table: &str,
    pk_columns: Vec<String>,
    pk_values: Vec<Option<String>>,
    pk_types: Vec<String>,
    update_columns: Vec<String>,
    update_values: Vec<Option<String>>,
    update_types: Vec<String>,
) -> Result<u64, String> {
    if pk_columns.is_empty() {
        return Err("Birincil anahtar bulunamadı".to_string());
    }
    if update_columns.is_empty() {
        return Err("Güncellenecek kolon bulunamadı".to_string());
    }

    let mut param_idx = 1usize;

    let set_clauses: Vec<String> = update_columns
        .iter()
        .zip(update_types.iter())
        .map(|(col, typ)| {
            let clause = format!("\"{}\" = ${}::{}", col, param_idx, typ);
            param_idx += 1;
            clause
        })
        .collect();

    let where_clauses: Vec<String> = pk_columns
        .iter()
        .zip(pk_types.iter())
        .map(|(col, typ)| {
            let clause = format!("\"{}\" = ${}::{}", col, param_idx, typ);
            param_idx += 1;
            clause
        })
        .collect();

    let sql = format!(
        "UPDATE \"{}\".\"{}\" SET {} WHERE {}",
        schema,
        table,
        set_clauses.join(", "),
        where_clauses.join(" AND ")
    );

    // Combine: update values first, then PK values
    let all_values: Vec<Option<String>> = update_values
        .into_iter()
        .chain(pk_values.into_iter())
        .collect();

    let param_types: Vec<Type> = vec![Type::TEXT; all_values.len()];
    let stmt = client
        .prepare_typed(&sql, &param_types)
        .await
        .map_err(|e| format_db_error(&e))?;

    let params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = all_values
        .iter()
        .map(|v| v as &(dyn tokio_postgres::types::ToSql + Sync))
        .collect();

    let affected = client
        .execute(&stmt, &params)
        .await
        .map_err(|e| format_db_error(&e))?;

    Ok(affected)
}

pub async fn insert_row(
    client: &Arc<Client>,
    schema: &str,
    table: &str,
    columns: Vec<String>,
    values: Vec<Option<String>>,
    column_types: Vec<String>,
) -> Result<u64, String> {
    if columns.is_empty() {
        return Err("Kolon belirtilmedi".to_string());
    }

    let col_list: Vec<String> = columns.iter().map(|c| format!("\"{}\"", c)).collect();

    let val_placeholders: Vec<String> = column_types
        .iter()
        .enumerate()
        .map(|(i, typ)| format!("${}::{}", i + 1, typ))
        .collect();

    let sql = format!(
        "INSERT INTO \"{}\".\"{}\" ({}) VALUES ({})",
        schema,
        table,
        col_list.join(", "),
        val_placeholders.join(", ")
    );

    let param_types: Vec<Type> = vec![Type::TEXT; values.len()];
    let stmt = client
        .prepare_typed(&sql, &param_types)
        .await
        .map_err(|e| format_db_error(&e))?;

    let params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = values
        .iter()
        .map(|v| v as &(dyn tokio_postgres::types::ToSql + Sync))
        .collect();

    let affected = client
        .execute(&stmt, &params)
        .await
        .map_err(|e| format_db_error(&e))?;

    Ok(affected)
}

pub async fn delete_rows(
    client: &Arc<Client>,
    schema: &str,
    table: &str,
    pk_columns: Vec<String>,
    pk_types: Vec<String>,
    pk_value_sets: Vec<Vec<Option<String>>>,
) -> Result<u64, String> {
    if pk_columns.is_empty() {
        return Err("Birincil anahtar bulunamadı".to_string());
    }
    if pk_value_sets.is_empty() {
        return Err("Silinecek satır bulunamadı".to_string());
    }

    let mut total_affected: u64 = 0;

    // Delete one row at a time for simplicity and safety
    for pk_values in &pk_value_sets {
        if pk_values.len() != pk_columns.len() {
            return Err("PK değer sayısı kolon sayısıyla eşleşmiyor".to_string());
        }

        let where_clauses: Vec<String> = pk_columns
            .iter()
            .zip(pk_types.iter())
            .enumerate()
            .map(|(i, (col, typ))| format!("\"{}\" = ${}::{}", col, i + 1, typ))
            .collect();

        let sql = format!(
            "DELETE FROM \"{}\".\"{}\" WHERE {}",
            schema,
            table,
            where_clauses.join(" AND ")
        );

        let param_types: Vec<Type> = vec![Type::TEXT; pk_values.len()];
        let stmt = client
            .prepare_typed(&sql, &param_types)
            .await
            .map_err(|e| format_db_error(&e))?;

        let params: Vec<&(dyn tokio_postgres::types::ToSql + Sync)> = pk_values
            .iter()
            .map(|v| v as &(dyn tokio_postgres::types::ToSql + Sync))
            .collect();

        let affected = client
            .execute(&stmt, &params)
            .await
            .map_err(|e| format_db_error(&e))?;

        total_affected += affected;
    }

    Ok(total_affected)
}

pub async fn export_table_data(
    client: &Arc<Client>,
    schema: &str,
    table: &str,
    format: &str,
) -> Result<String, String> {
    let sql = format!("SELECT * FROM \"{}\".\"{}\"", schema, table);
    let rows = client
        .query(&sql, &[])
        .await
        .map_err(|e| format!("Veri alınamadı: {}", e))?;

    if rows.is_empty() {
        return Ok(if format == "csv" {
            String::new()
        } else {
            "[]".to_string()
        });
    }

    let columns: Vec<&str> = rows[0].columns().iter().map(|c| c.name()).collect();
    let col_types: Vec<&Type> = rows[0].columns().iter().map(|c| c.type_()).collect();

    if format == "csv" {
        let mut csv = columns.join(",");
        csv.push('\n');

        for row in &rows {
            let vals: Vec<String> = columns
                .iter()
                .enumerate()
                .map(|(idx, _)| {
                    let val = pg_value_to_json(row, idx, col_types[idx]);
                    match val {
                        serde_json::Value::Null => String::new(),
                        serde_json::Value::String(s) => {
                            if s.contains(',') || s.contains('"') || s.contains('\n') {
                                format!("\"{}\"", s.replace('"', "\"\""))
                            } else {
                                s
                            }
                        }
                        other => other.to_string(),
                    }
                })
                .collect();
            csv.push_str(&vals.join(","));
            csv.push('\n');
        }
        Ok(csv)
    } else {
        // JSON
        let json_rows: Vec<serde_json::Value> = rows
            .iter()
            .map(|row| {
                let mut obj = serde_json::Map::new();
                for (idx, col_name) in columns.iter().enumerate() {
                    obj.insert(
                        col_name.to_string(),
                        pg_value_to_json(row, idx, col_types[idx]),
                    );
                }
                serde_json::Value::Object(obj)
            })
            .collect();

        serde_json::to_string_pretty(&json_rows)
            .map_err(|e| format!("JSON dönüşümü başarısız: {}", e))
    }
}
