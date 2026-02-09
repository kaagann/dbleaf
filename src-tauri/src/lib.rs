mod ai;
mod backup;
mod db;
mod query_history;
mod ssh_tunnel;
mod storage;

use db::connection::{create_connection_manager, AppConnectionManager};
use db::models::ConnectionConfig;
use db::queries;

#[tauri::command]
async fn test_connection(config: ConnectionConfig) -> Result<String, String> {
    db::connection::ConnectionManager::test_connection(&config).await
}

#[tauri::command]
async fn connect_db(
    config: ConnectionConfig,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<String, String> {
    let mut manager = state.lock().await;
    manager.connect(&config).await
}

#[tauri::command]
async fn disconnect_db(
    connection_id: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<(), String> {
    let mut manager = state.lock().await;
    manager.disconnect(&connection_id)
}

#[tauri::command]
async fn save_connections(connections: Vec<ConnectionConfig>) -> Result<(), String> {
    storage::save_connections(&connections)
}

#[tauri::command]
async fn load_connections() -> Result<Vec<ConnectionConfig>, String> {
    storage::load_connections()
}

#[tauri::command]
async fn list_databases(
    connection_id: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<Vec<queries::DatabaseInfo>, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::list_databases(&client).await
}

#[tauri::command]
async fn list_schemas(
    connection_id: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<Vec<queries::SchemaInfo>, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::list_schemas(&client).await
}

#[tauri::command]
async fn list_tables(
    connection_id: String,
    schema: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<Vec<queries::TableInfo>, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::list_tables(&client, &schema).await
}

#[tauri::command]
async fn list_columns(
    connection_id: String,
    schema: String,
    table: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<Vec<queries::ColumnInfo>, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::list_columns(&client, &schema, &table).await
}

#[tauri::command]
async fn list_enum_values(
    connection_id: String,
    type_name: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<Vec<String>, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::list_enum_values(&client, &type_name).await
}

#[tauri::command]
async fn list_indexes(
    connection_id: String,
    schema: String,
    table: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<Vec<queries::IndexInfo>, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::list_indexes(&client, &schema, &table).await
}

#[tauri::command]
async fn list_foreign_keys(
    connection_id: String,
    schema: String,
    table: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<Vec<queries::ForeignKeyInfo>, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::list_foreign_keys(&client, &schema, &table).await
}

#[tauri::command]
async fn list_functions(
    connection_id: String,
    schema: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<Vec<queries::FunctionInfo>, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::list_functions(&client, &schema).await
}

#[tauri::command]
async fn list_sequences(
    connection_id: String,
    schema: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<Vec<queries::SequenceInfo>, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::list_sequences(&client, &schema).await
}

#[tauri::command]
async fn query_table_data(
    connection_id: String,
    schema: String,
    table: String,
    page: i64,
    page_size: i64,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<queries::TableDataResult, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::query_table_data(&client, &schema, &table, page, page_size, sort_column, sort_direction).await
}

#[tauri::command]
async fn execute_query(
    connection_id: String,
    sql: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<queries::ExecuteQueryResult, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::execute_query(&client, &sql).await
}

#[tauri::command]
async fn get_schema_completions(
    connection_id: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<queries::CompletionSchema, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::get_schema_completions(&client).await
}

#[tauri::command]
async fn export_table_data(
    connection_id: String,
    schema: String,
    table: String,
    format: String,
    output_path: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<(), String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    let data = queries::export_table_data(&client, &schema, &table, &format).await?;
    std::fs::write(&output_path, data).map_err(|e| format!("Dosya yazılamadı: {}", e))?;
    Ok(())
}

#[tauri::command]
async fn update_row(
    connection_id: String,
    schema: String,
    table: String,
    pk_columns: Vec<String>,
    pk_values: Vec<Option<String>>,
    pk_types: Vec<String>,
    update_columns: Vec<String>,
    update_values: Vec<Option<String>>,
    update_types: Vec<String>,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<u64, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::update_row(
        &client, &schema, &table,
        pk_columns, pk_values, pk_types,
        update_columns, update_values, update_types,
    )
    .await
}

#[tauri::command]
async fn insert_row(
    connection_id: String,
    schema: String,
    table: String,
    columns: Vec<String>,
    values: Vec<Option<String>>,
    column_types: Vec<String>,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<u64, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::insert_row(&client, &schema, &table, columns, values, column_types).await
}

#[tauri::command]
async fn delete_rows(
    connection_id: String,
    schema: String,
    table: String,
    pk_columns: Vec<String>,
    pk_types: Vec<String>,
    pk_value_sets: Vec<Vec<Option<String>>>,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<u64, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::delete_rows(&client, &schema, &table, pk_columns, pk_types, pk_value_sets).await
}

#[tauri::command]
async fn backup_database(
    config: ConnectionConfig,
    format: String,
    output_path: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<backup::BackupResult, String> {
    let tunnel_port = {
        let manager = state.lock().await;
        manager.get_tunnel_port(&config.id)
    };
    tokio::task::spawn_blocking(move || {
        backup::backup_database(&config, &format, &output_path, tunnel_port)
    })
    .await
    .map_err(|e| format!("Yedekleme görevi başarısız: {}", e))?
}

#[tauri::command]
async fn restore_database(
    config: ConnectionConfig,
    input_path: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<backup::RestoreResult, String> {
    let tunnel_port = {
        let manager = state.lock().await;
        manager.get_tunnel_port(&config.id)
    };
    tokio::task::spawn_blocking(move || {
        backup::restore_database(&config, &input_path, tunnel_port)
    })
    .await
    .map_err(|e| format!("Geri yükleme görevi başarısız: {}", e))?
}

#[tauri::command]
async fn add_query_history(entry: query_history::QueryHistoryEntry) -> Result<(), String> {
    query_history::add_history_entry(entry)
}

#[tauri::command]
async fn get_query_history() -> Result<Vec<query_history::QueryHistoryEntry>, String> {
    query_history::load_history()
}

#[tauri::command]
async fn toggle_query_favorite(id: String) -> Result<(), String> {
    query_history::toggle_favorite(&id)
}

#[tauri::command]
async fn delete_query_history_entry(id: String) -> Result<(), String> {
    query_history::delete_history_entry(&id)
}

#[tauri::command]
async fn clear_query_history() -> Result<(), String> {
    query_history::clear_history()
}

#[tauri::command]
async fn explain_query(
    connection_id: String,
    sql: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<queries::ExplainResult, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::explain_query(&client, &sql).await
}

#[tauri::command]
async fn get_er_diagram_data(
    connection_id: String,
    schema: String,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<queries::ErDiagramData, String> {
    let manager = state.lock().await;
    let client = manager.get_client(&connection_id)?;
    queries::get_er_diagram_data(&client, &schema).await
}

#[tauri::command]
async fn save_ai_settings(settings: ai::AiSettings) -> Result<(), String> {
    ai::save_ai_settings(&settings)
}

#[tauri::command]
async fn load_ai_settings() -> Result<ai::AiSettings, String> {
    ai::load_ai_settings()
}

#[tauri::command]
async fn ai_chat(
    connection_id: String,
    messages: Vec<ai::ChatMessage>,
    db_context: String,
    channel: tauri::ipc::Channel<ai::AiStreamEvent>,
    state: tauri::State<'_, AppConnectionManager>,
) -> Result<(), String> {
    let settings = ai::load_ai_settings()?;
    let client = {
        let manager = state.lock().await;
        manager.get_client(&connection_id)?
    };
    ai::ai_chat(&client, messages, &settings, &db_context, channel).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(create_connection_manager())
        .invoke_handler(tauri::generate_handler![
            test_connection,
            connect_db,
            disconnect_db,
            save_connections,
            load_connections,
            list_schemas,
            list_tables,
            list_columns,
            list_enum_values,
            list_indexes,
            list_foreign_keys,
            list_functions,
            list_sequences,
            query_table_data,
            execute_query,
            get_schema_completions,
            list_databases,
            export_table_data,
            update_row,
            insert_row,
            delete_rows,
            backup_database,
            restore_database,
            add_query_history,
            get_query_history,
            toggle_query_favorite,
            delete_query_history_entry,
            clear_query_history,
            explain_query,
            get_er_diagram_data,
            save_ai_settings,
            load_ai_settings,
            ai_chat,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
