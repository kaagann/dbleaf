export interface QueryHistoryEntry {
  id: string;
  sql: string;
  connectionId: string;
  connectionName: string;
  database: string;
  timestamp: string;
  durationMs: number;
  rowCount: number;
  success: boolean;
  errorMessage: string | null;
  isFavorite: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fromRustHistoryEntry(raw: any): QueryHistoryEntry {
  return {
    id: raw.id,
    sql: raw.sql,
    connectionId: raw.connection_id ?? "",
    connectionName: raw.connection_name ?? "",
    database: raw.database ?? "",
    timestamp: raw.timestamp ?? "",
    durationMs: raw.duration_ms ?? 0,
    rowCount: raw.row_count ?? 0,
    success: raw.success ?? true,
    errorMessage: raw.error_message ?? null,
    isFavorite: raw.is_favorite ?? false,
  };
}

export function toRustHistoryEntry(entry: QueryHistoryEntry): Record<string, unknown> {
  return {
    id: entry.id,
    sql: entry.sql,
    connection_id: entry.connectionId,
    connection_name: entry.connectionName,
    database: entry.database,
    timestamp: entry.timestamp,
    duration_ms: entry.durationMs,
    row_count: entry.rowCount,
    success: entry.success,
    error_message: entry.errorMessage,
    is_favorite: entry.isFavorite,
  };
}
