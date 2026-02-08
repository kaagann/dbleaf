import { useState, useEffect, useCallback, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ArrowUp,
  ArrowDown,
  Loader2,
  Clock,
  Rows3,
  Download,
  Plus,
  Trash2,
  Save,
  Undo2,
  AlertTriangle,
  PenLine,
} from "lucide-react";
import { useConnectionStore } from "../stores/connectionStore";
import { useTranslation } from "react-i18next";

interface TableDataResult {
  columns: { name: string; data_type: string }[];
  rows: any[][];
  total_rows: number;
  page: number;
  page_size: number;
  execution_time_ms: number;
}

interface ColumnMeta {
  name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string | null;
  is_primary_key: boolean;
  ordinal_position: number;
  udt_name: string | null;
}

interface Props {
  schema: string;
  table: string;
  tabId?: string;
  tableType?: "table" | "view";
}

const PAGE_SIZE = 50;

export default function DataTable({ schema, table, tabId: _tabId, tableType }: Props) {
  const { t } = useTranslation("database");
  const { t: tc } = useTranslation("common");
  const { activeConnectionId } = useConnectionStore();
  const [data, setData] = useState<TableDataResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [isExporting, setIsExporting] = useState(false);

  // Editing state
  const [columnMeta, setColumnMeta] = useState<ColumnMeta[]>([]);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [pendingChanges, setPendingChanges] = useState<Record<string, Record<string, any>>>({});
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editSidebarRowIdx, setEditSidebarRowIdx] = useState<number | null>(null);
  const [addingRow, setAddingRow] = useState(false);
  const [newRowValues, setNewRowValues] = useState<Record<string, string>>({});
  const [enumValues, setEnumValues] = useState<Record<string, string[]>>({});

  const editInputRef = useRef<HTMLInputElement>(null);
  const editSelectRef = useRef<HTMLSelectElement>(null);

  // Derived
  const pkColumns = columnMeta.filter((c) => c.is_primary_key);
  const hasPK = pkColumns.length > 0;
  const isView = tableType === "view";
  const canEdit = hasPK && !isView;
  const pendingCount = Object.keys(pendingChanges).length;

  // Fetch column metadata for PK detection
  useEffect(() => {
    if (!activeConnectionId) return;
    invoke<ColumnMeta[]>("list_columns", {
      connectionId: activeConnectionId,
      schema,
      table,
    })
      .then((cols) => {
        setColumnMeta(cols);
        // Fetch enum values for USER-DEFINED columns
        const enumTypes = [
          ...new Set(
            cols
              .filter((c) => c.data_type === "USER-DEFINED" && c.udt_name)
              .map((c) => c.udt_name!)
          ),
        ];
        enumTypes.forEach((typeName) => {
          invoke<string[]>("list_enum_values", {
            connectionId: activeConnectionId,
            typeName,
          }).then((values) => {
            setEnumValues((prev) => ({ ...prev, [typeName]: values }));
          }).catch(() => {});
        });
      })
      .catch(() => {});
  }, [activeConnectionId, schema, table]);

  const fetchData = useCallback(async () => {
    if (!activeConnectionId) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await invoke<TableDataResult>("query_table_data", {
        connectionId: activeConnectionId,
        schema,
        table,
        page,
        pageSize: PAGE_SIZE,
        sortColumn: sorting[0]?.id || null,
        sortDirection: sorting[0] ? (sorting[0].desc ? "desc" : "asc") : null,
      });
      setData(result);
    } catch (err: any) {
      setError(err?.toString() || t("table.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [activeConnectionId, schema, table, page, sorting]);

  useEffect(() => {
    setPage(1);
    setSorting([]);
    setPendingChanges({});
    setSelectedRows(new Set());
    setEditingCell(null);
    setEditSidebarRowIdx(null);
    setAddingRow(false);
  }, [schema, table]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Focus edit input/select when editing cell changes
  useEffect(() => {
    if (editingCell) {
      if (editInputRef.current) {
        editInputRef.current.focus();
        editInputRef.current.select();
      } else if (editSelectRef.current) {
        editSelectRef.current.focus();
      }
    }
  }, [editingCell]);

  // ── Row key from PK values ──
  function getRowKey(row: any[]): string {
    if (!hasPK || !data) return "";
    const pkValues = pkColumns.map((pk) => {
      const colIdx = data.columns.findIndex((c) => c.name === pk.name);
      return row[colIdx];
    });
    return JSON.stringify(pkValues);
  }

  // ── Get display value considering pending changes ──
  function getDisplayValue(row: any[], colName: string): any {
    const rowKey = getRowKey(row);
    if (pendingChanges[rowKey]?.[colName] !== undefined) {
      return pendingChanges[rowKey][colName];
    }
    const colIdx = data!.columns.findIndex((c) => c.name === colName);
    return row[colIdx];
  }

  // ── Inline editing ──
  function handleCellDoubleClick(rowIdx: number, colName: string) {
    if (!canEdit) return;
    const meta = columnMeta.find((c) => c.name === colName);
    if (meta?.is_primary_key) return;

    const row = data!.rows[rowIdx];
    const currentValue = getDisplayValue(row, colName);
    setEditingCell({ row: rowIdx, col: colName });
    setEditValue(currentValue === null || currentValue === undefined ? "" : String(currentValue));
  }

  function confirmEdit() {
    if (!editingCell || !data) return;
    const { row: rowIdx, col: colName } = editingCell;
    const row = data.rows[rowIdx];
    const rowKey = getRowKey(row);
    const colIdx = data.columns.findIndex((c) => c.name === colName);
    const originalValue = row[colIdx];

    // Determine new value
    let newValue: any = editValue;
    const colMeta = columnMeta.find((c) => c.name === colName);
    if (editValue === "" && colMeta?.is_nullable) {
      newValue = null;
    }

    // Check if value actually changed from original
    const originalStr = originalValue === null || originalValue === undefined ? "" : String(originalValue);
    if (editValue === originalStr) {
      setEditingCell(null);
      return;
    }

    setPendingChanges((prev) => ({
      ...prev,
      [rowKey]: {
        ...(prev[rowKey] || {}),
        [colName]: newValue === "" ? null : newValue,
      },
    }));

    setEditingCell(null);
  }

  function cancelEdit() {
    setEditingCell(null);
  }

  function isBoolean(colName: string): boolean {
    const meta = columnMeta.find((c) => c.name === colName);
    return meta?.data_type === "boolean";
  }

  function getEnumOptions(colName: string): string[] | null {
    const meta = columnMeta.find((c) => c.name === colName);
    if (meta?.data_type !== "USER-DEFINED" || !meta?.udt_name) return null;
    return enumValues[meta.udt_name] || null;
  }

  function handleSetNull(rowIdx: number, colName: string) {
    if (!data) return;
    const row = data.rows[rowIdx];
    const rowKey = getRowKey(row);

    setPendingChanges((prev) => ({
      ...prev,
      [rowKey]: {
        ...(prev[rowKey] || {}),
        [colName]: null,
      },
    }));
  }

  // ── Save all pending changes ──
  async function saveChanges() {
    if (!activeConnectionId || !data) return;
    setIsSaving(true);
    setError(null);

    try {
      for (const [rowKey, changes] of Object.entries(pendingChanges)) {
        const pkValues: any[] = JSON.parse(rowKey);

        const updateCols = Object.keys(changes);
        const updateVals = Object.values(changes).map((v) =>
          v === null ? null : String(v)
        );
        const updateTypes = updateCols.map((col) => {
          const dataCol = data.columns.find((c) => c.name === col);
          return dataCol?.data_type || "text";
        });

        await invoke("update_row", {
          connectionId: activeConnectionId,
          schema,
          table,
          pkColumns: pkColumns.map((p) => p.name),
          pkValues: pkValues.map((v: any) => (v === null ? null : String(v))),
          pkTypes: pkColumns.map((pk) => {
            const dataCol = data.columns.find((c) => c.name === pk.name);
            return dataCol?.data_type || "text";
          }),
          updateColumns: updateCols,
          updateValues: updateVals,
          updateTypes,
        });
      }

      setPendingChanges({});
      fetchData();
    } catch (err: any) {
      setError(err?.toString() || t("table.saveError"));
    } finally {
      setIsSaving(false);
    }
  }

  function discardChanges() {
    setPendingChanges({});
    setEditingCell(null);
  }

  // ── Row selection ──
  function toggleRowSelection(rowKey: string) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (!data) return;
    if (selectedRows.size === data.rows.length) {
      setSelectedRows(new Set());
    } else {
      const all = new Set(data.rows.map((r) => getRowKey(r)));
      setSelectedRows(all);
    }
  }

  // ── Delete selected rows ──
  async function deleteSelectedRows() {
    if (!activeConnectionId || !data || selectedRows.size === 0) return;
    setIsDeleting(true);
    setError(null);

    try {
      const pkValueSets = Array.from(selectedRows).map((key) => {
        return (JSON.parse(key) as any[]).map((v: any) => (v === null ? null : String(v)));
      });

      await invoke<number>("delete_rows", {
        connectionId: activeConnectionId,
        schema,
        table,
        pkColumns: pkColumns.map((p) => p.name),
        pkTypes: pkColumns.map((pk) => {
          const dataCol = data.columns.find((c) => c.name === pk.name);
          return dataCol?.data_type || "text";
        }),
        pkValueSets,
      });

      setSelectedRows(new Set());
      fetchData();
    } catch (err: any) {
      setError(err?.toString() || t("table.deleteError"));
    } finally {
      setIsDeleting(false);
    }
  }

  // ── Add new row ──
  async function saveNewRow() {
    if (!activeConnectionId || !data) return;
    setIsSaving(true);
    setError(null);

    try {
      const cols: string[] = [];
      const vals: (string | null)[] = [];
      const types: string[] = [];

      for (const col of data.columns) {
        const val = newRowValues[col.name];
        if (val !== undefined && val !== "") {
          cols.push(col.name);
          vals.push(val);
          types.push(col.data_type);
        } else if (val === "") {
          // Explicitly set to NULL
          const meta = columnMeta.find((c) => c.name === col.name);
          if (meta?.is_nullable) {
            cols.push(col.name);
            vals.push(null);
            types.push(col.data_type);
          }
        }
      }

      if (cols.length === 0) {
        setError(t("table.insertMinCol"));
        setIsSaving(false);
        return;
      }

      await invoke("insert_row", {
        connectionId: activeConnectionId,
        schema,
        table,
        columns: cols,
        values: vals,
        columnTypes: types,
      });

      setAddingRow(false);
      setNewRowValues({});
      fetchData();
    } catch (err: any) {
      setError(err?.toString() || t("table.insertError"));
    } finally {
      setIsSaving(false);
    }
  }

  // ── Export ──
  async function handleExport(format: "csv" | "json") {
    if (!activeConnectionId) return;
    const ext = format === "csv" ? "csv" : "json";
    const filePath = await save({
      defaultPath: `${table}.${ext}`,
      filters: [{ name: format.toUpperCase(), extensions: [ext] }],
    });
    if (!filePath) return;
    setIsExporting(true);
    try {
      await invoke("export_table_data", {
        connectionId: activeConnectionId,
        schema,
        table,
        format,
        outputPath: filePath,
      });
    } catch (err: any) {
      setError(err?.toString() || tc("exportError"));
    } finally {
      setIsExporting(false);
    }
  }

  // ── Edit sidebar ──
  function openEditSidebar(rowIdx: number) {
    setEditSidebarRowIdx(rowIdx);
  }

  function closeEditSidebar() {
    setEditSidebarRowIdx(null);
  }

  // ── Cell rendering helper ──
  function renderCellValue(val: any) {
    if (val === null || val === undefined)
      return <span className="text-text-muted italic">NULL</span>;
    if (typeof val === "object")
      return <span className="font-mono text-accent">{JSON.stringify(val)}</span>;
    if (typeof val === "boolean")
      return (
        <span className={val ? "text-success" : "text-danger"}>
          {val.toString()}
        </span>
      );
    return <span>{String(val)}</span>;
  }

  // ── TanStack columns ──
  const columns: ColumnDef<any[], any>[] = (data?.columns || []).map(
    (col, idx) => ({
      id: col.name,
      header: () => {
        const meta = columnMeta.find((c) => c.name === col.name);
        return (
          <div className="flex items-center gap-1">
            {meta?.is_primary_key && (
              <span className="text-warning text-[10px]" title="Primary Key">PK</span>
            )}
            <span>{col.name}</span>
            <span className="text-[10px] text-text-muted font-normal">
              {col.data_type}
            </span>
          </div>
        );
      },
      accessorFn: (row: any[]) => row[idx],
      cell: ({ getValue }) => renderCellValue(getValue()),
      enableSorting: true,
    })
  );

  const tanstackTable = useReactTable({
    data: data?.rows || [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
  });

  const totalPages = data ? Math.ceil(data.total_rows / PAGE_SIZE) : 0;

  if (error && !data) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-danger">
          <p className="text-sm font-medium">{tc("error")}</p>
          <p className="mt-1 text-xs text-text-muted">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar for editing actions */}
      {canEdit && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-primary bg-bg-secondary px-3 py-1.5">
          <button
            onClick={() => {
              setAddingRow(true);
              setNewRowValues({});
            }}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
            title={t("table.addRow")}
          >
            <Plus className="h-3.5 w-3.5" />
            {tc("add")}
          </button>
          {selectedRows.size > 0 && (
            <button
              onClick={deleteSelectedRows}
              disabled={isDeleting}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
              title={t("table.deleteSelected")}
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
              {t("table.deleteCount", { count: selectedRows.size })}
            </button>
          )}
          {pendingCount > 0 && (
            <>
              <div className="mx-1 h-4 w-px bg-border-primary" />
              <span className="text-xs text-warning">
                {t("table.pendingChanges", { count: pendingCount })}
              </span>
              <button
                onClick={saveChanges}
                disabled={isSaving}
                className="flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs font-medium text-black hover:bg-accent-hover disabled:opacity-50 transition-colors"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {tc("save")}
              </button>
              <button
                onClick={discardChanges}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                <Undo2 className="h-3.5 w-3.5" />
                {tc("cancel")}
              </button>
            </>
          )}
        </div>
      )}

      {/* No PK warning for tables */}
      {!isView && !hasPK && columnMeta.length > 0 && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-primary bg-warning/10 px-3 py-1.5 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5" />
          {t("table.noPkWarning")}
        </div>
      )}

      {/* Error banner (non-blocking) */}
      {error && data && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border-primary bg-danger/10 px-3 py-1.5 text-xs text-danger">
          <AlertTriangle className="h-3.5 w-3.5" />
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-auto text-text-muted hover:text-text-primary"
          >
            ×
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Main table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-bg-secondary">
              {tanstackTable.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {/* Checkbox column */}
                  {canEdit && (
                    <th className="w-8 border-b border-r border-border-primary px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={data ? selectedRows.size === data.rows.length && data.rows.length > 0 : false}
                        onChange={toggleSelectAll}
                        className="accent-accent h-3 w-3"
                      />
                    </th>
                  )}
                  {/* Row number */}
                  <th className="w-12 border-b border-r border-border-primary px-2 py-1.5 text-center text-xs font-medium text-text-muted">
                    #
                  </th>
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      onClick={header.column.getToggleSortingHandler()}
                      className="cursor-pointer select-none border-b border-r border-border-primary px-3 py-1.5 text-left text-xs font-medium text-text-secondary hover:bg-bg-hover transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1">
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {header.column.getIsSorted() === "asc" && (
                          <ArrowUp className="h-3 w-3 text-accent" />
                        )}
                        {header.column.getIsSorted() === "desc" && (
                          <ArrowDown className="h-3 w-3 text-accent" />
                        )}
                      </div>
                    </th>
                  ))}
                  {/* Edit column */}
                  {canEdit && (
                    <th className="w-10 border-b border-r border-border-primary" />
                  )}
                </tr>
              ))}
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td
                    colSpan={(data?.columns.length || 1) + (canEdit ? 3 : 1)}
                    className="py-12 text-center"
                  >
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-text-muted" />
                  </td>
                </tr>
              ) : (
                tanstackTable.getRowModel().rows.map((row, rowIdx) => {
                  const rawRow = data!.rows[rowIdx];
                  const rowKey = getRowKey(rawRow);
                  const isSelected = selectedRows.has(rowKey);
                  const hasChanges = !!pendingChanges[rowKey];

                  return (
                    <tr
                      key={row.id}
                      className={`transition-colors ${
                        isSelected
                          ? "bg-accent/10"
                          : hasChanges
                            ? "bg-warning/5"
                            : "hover:bg-bg-hover/50"
                      }`}
                    >
                      {/* Checkbox */}
                      {canEdit && (
                        <td className="border-b border-r border-border-primary px-2 py-1 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleRowSelection(rowKey)}
                            className="accent-accent h-3 w-3"
                          />
                        </td>
                      )}
                      {/* Row number */}
                      <td className="border-b border-r border-border-primary px-2 py-1 text-center text-xs text-text-muted">
                        {(page - 1) * PAGE_SIZE + rowIdx + 1}
                      </td>
                      {/* Data cells */}
                      {row.getVisibleCells().map((cell) => {
                        const colName = cell.column.id;
                        const meta = columnMeta.find((c) => c.name === colName);
                        const isPK = meta?.is_primary_key;
                        const isEditing =
                          editingCell?.row === rowIdx && editingCell?.col === colName;
                        const hasCellChange = pendingChanges[rowKey]?.[colName] !== undefined;

                        // Get display value (with pending changes applied)
                        const displayVal = hasCellChange
                          ? pendingChanges[rowKey][colName]
                          : cell.getValue();

                        return (
                          <td
                            key={cell.id}
                            onDoubleClick={() => handleCellDoubleClick(rowIdx, colName)}
                            className={`border-b border-r border-border-primary px-3 py-1 font-mono text-xs max-w-xs transition-colors ${
                              isEditing
                                ? "p-0"
                                : isPK
                                  ? "text-text-muted"
                                  : hasCellChange
                                    ? "bg-warning/10 text-warning"
                                    : "text-text-primary"
                            } ${canEdit && !isPK ? "cursor-text" : ""}`}
                          >
                            {isEditing ? (
                              isBoolean(colName) ? (
                                <select
                                  ref={editSelectRef}
                                  value={editValue}
                                  onChange={(e) => {
                                    setEditValue(e.target.value);
                                    // Auto-confirm on select change
                                    const val = e.target.value;
                                    const row = data!.rows[rowIdx];
                                    const rk = getRowKey(row);
                                    const ci = data!.columns.findIndex((c) => c.name === colName);
                                    const orig = row[ci];
                                    const origStr = orig === null || orig === undefined ? "" : String(orig);
                                    if (val !== origStr) {
                                      setPendingChanges((prev) => ({
                                        ...prev,
                                        [rk]: {
                                          ...(prev[rk] || {}),
                                          [colName]: val === "" ? null : val,
                                        },
                                      }));
                                    }
                                    setEditingCell(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") cancelEdit();
                                  }}
                                  onBlur={() => setEditingCell(null)}
                                  className="w-full bg-bg-primary px-2 py-1 font-mono text-xs text-text-primary outline-none ring-1 ring-accent"
                                >
                                  {columnMeta.find((c) => c.name === colName)?.is_nullable && (
                                    <option value="">NULL</option>
                                  )}
                                  <option value="true">true</option>
                                  <option value="false">false</option>
                                </select>
                              ) : getEnumOptions(colName) ? (
                                <select
                                  ref={editSelectRef}
                                  value={editValue}
                                  onChange={(e) => {
                                    setEditValue(e.target.value);
                                    const val = e.target.value;
                                    const row = data!.rows[rowIdx];
                                    const rk = getRowKey(row);
                                    const ci = data!.columns.findIndex((c) => c.name === colName);
                                    const orig = row[ci];
                                    const origStr = orig === null || orig === undefined ? "" : String(orig);
                                    if (val !== origStr) {
                                      setPendingChanges((prev) => ({
                                        ...prev,
                                        [rk]: {
                                          ...(prev[rk] || {}),
                                          [colName]: val === "" ? null : val,
                                        },
                                      }));
                                    }
                                    setEditingCell(null);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === "Escape") cancelEdit();
                                  }}
                                  onBlur={() => setEditingCell(null)}
                                  className="w-full bg-bg-primary px-2 py-1 font-mono text-xs text-text-primary outline-none ring-1 ring-accent"
                                >
                                  {columnMeta.find((c) => c.name === colName)?.is_nullable && (
                                    <option value="">NULL</option>
                                  )}
                                  {getEnumOptions(colName)!.map((v) => (
                                    <option key={v} value={v}>{v}</option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  ref={editInputRef}
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") confirmEdit();
                                    if (e.key === "Escape") cancelEdit();
                                  }}
                                  onBlur={confirmEdit}
                                  className="w-full bg-bg-primary px-3 py-1 font-mono text-xs text-text-primary outline-none ring-1 ring-accent"
                                />
                              )
                            ) : (
                              <span className="truncate block">
                                {renderCellValue(displayVal)}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      {/* Edit button */}
                      {canEdit && (
                        <td className="border-b border-r border-border-primary px-1 py-1 text-center">
                          <button
                            onClick={() => openEditSidebar(rowIdx)}
                            className="rounded p-0.5 text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-primary hover:bg-bg-hover transition-all"
                            title={tc("edit")}
                            style={{ opacity: editSidebarRowIdx === rowIdx ? 1 : undefined }}
                          >
                            <PenLine className="h-3 w-3" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Edit Sidebar */}
        {editSidebarRowIdx !== null && data && (
          <div className="w-[360px] shrink-0 border-l border-border-primary bg-bg-secondary overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border-primary px-4 py-2">
              <h3 className="text-xs font-semibold text-text-primary">
                {t("table.editRow")}
              </h3>
              <button
                onClick={closeEditSidebar}
                className="text-text-muted hover:text-text-primary text-xs"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              {data.columns.map((col) => {
                const meta = columnMeta.find((c) => c.name === col.name);
                const isPK = meta?.is_primary_key;
                const row = data.rows[editSidebarRowIdx];
                const rowKey = getRowKey(row);
                const colIdx = data.columns.findIndex((c) => c.name === col.name);
                const currentVal =
                  pendingChanges[rowKey]?.[col.name] !== undefined
                    ? pendingChanges[rowKey][col.name]
                    : row[colIdx];

                return (
                  <div key={col.name}>
                    <label className="mb-1 flex items-center gap-1.5 text-xs text-text-secondary">
                      {isPK && (
                        <span className="text-warning text-[10px]">PK</span>
                      )}
                      <span>{col.name}</span>
                      <span className="text-[10px] text-text-muted">
                        {col.data_type}
                      </span>
                    </label>
                    <div className="flex gap-1">
                      {!isPK && isBoolean(col.name) ? (
                        <select
                          value={
                            currentVal === null || currentVal === undefined
                              ? ""
                              : String(currentVal)
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            setPendingChanges((prev) => ({
                              ...prev,
                              [rowKey]: {
                                ...(prev[rowKey] || {}),
                                [col.name]: val === "" ? null : val,
                              },
                            }));
                          }}
                          className="flex-1 rounded border border-border-primary bg-bg-primary px-2 py-1.5 font-mono text-xs text-text-primary focus:border-accent focus:outline-none"
                        >
                          {meta?.is_nullable && <option value="">NULL</option>}
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </select>
                      ) : !isPK && getEnumOptions(col.name) ? (
                        <select
                          value={
                            currentVal === null || currentVal === undefined
                              ? ""
                              : String(currentVal)
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            setPendingChanges((prev) => ({
                              ...prev,
                              [rowKey]: {
                                ...(prev[rowKey] || {}),
                                [col.name]: val === "" ? null : val,
                              },
                            }));
                          }}
                          className="flex-1 rounded border border-border-primary bg-bg-primary px-2 py-1.5 font-mono text-xs text-text-primary focus:border-accent focus:outline-none"
                        >
                          {meta?.is_nullable && <option value="">NULL</option>}
                          {getEnumOptions(col.name)!.map((v) => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={
                            currentVal === null || currentVal === undefined
                              ? ""
                              : String(currentVal)
                          }
                          disabled={isPK}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPendingChanges((prev) => ({
                              ...prev,
                              [rowKey]: {
                                ...(prev[rowKey] || {}),
                                [col.name]: val === "" ? null : val,
                              },
                            }));
                          }}
                          placeholder={currentVal === null ? "NULL" : ""}
                          className={`flex-1 rounded border border-border-primary bg-bg-primary px-2 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-muted/50 placeholder:italic focus:border-accent focus:outline-none ${
                            isPK ? "opacity-50 cursor-not-allowed" : ""
                          }`}
                        />
                      )}
                      {!isPK && meta?.is_nullable && (
                        <button
                          onClick={() => handleSetNull(editSidebarRowIdx, col.name)}
                          className={`rounded border px-1.5 text-[10px] transition-colors ${
                            currentVal === null
                              ? "border-warning text-warning bg-warning/10"
                              : "border-border-primary text-text-muted hover:text-text-primary"
                          }`}
                          title={t("table.setNull")}
                        >
                          NULL
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Add Row Sidebar */}
        {addingRow && data && (
          <div className="w-[360px] shrink-0 border-l border-border-primary bg-bg-secondary overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border-primary px-4 py-2">
              <h3 className="text-xs font-semibold text-text-primary">
                {t("table.addNewRow")}
              </h3>
              <button
                onClick={() => setAddingRow(false)}
                className="text-text-muted hover:text-text-primary text-xs"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-3">
              {data.columns.map((col) => {
                const meta = columnMeta.find((c) => c.name === col.name);
                return (
                  <div key={col.name}>
                    <label className="mb-1 flex items-center gap-1.5 text-xs text-text-secondary">
                      {meta?.is_primary_key && (
                        <span className="text-warning text-[10px]">PK</span>
                      )}
                      <span>{col.name}</span>
                      <span className="text-[10px] text-text-muted">
                        {col.data_type}
                      </span>
                      {meta?.column_default && (
                        <span className="text-[10px] text-text-muted">
                          = {meta.column_default}
                        </span>
                      )}
                    </label>
                    {isBoolean(col.name) ? (
                      <select
                        value={newRowValues[col.name] || ""}
                        onChange={(e) =>
                          setNewRowValues((prev) => ({
                            ...prev,
                            [col.name]: e.target.value,
                          }))
                        }
                        className="w-full rounded border border-border-primary bg-bg-primary px-2 py-1.5 font-mono text-xs text-text-primary focus:border-accent focus:outline-none"
                      >
                        <option value="">
                          {meta?.column_default
                            ? t("table.defaultValue", { value: meta.column_default })
                            : meta?.is_nullable
                              ? "NULL"
                              : ""}
                        </option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : getEnumOptions(col.name) ? (
                      <select
                        value={newRowValues[col.name] || ""}
                        onChange={(e) =>
                          setNewRowValues((prev) => ({
                            ...prev,
                            [col.name]: e.target.value,
                          }))
                        }
                        className="w-full rounded border border-border-primary bg-bg-primary px-2 py-1.5 font-mono text-xs text-text-primary focus:border-accent focus:outline-none"
                      >
                        <option value="">
                          {meta?.column_default
                            ? t("table.defaultValue", { value: meta.column_default })
                            : meta?.is_nullable
                              ? "NULL"
                              : ""}
                        </option>
                        {getEnumOptions(col.name)!.map((v) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        value={newRowValues[col.name] || ""}
                        onChange={(e) =>
                          setNewRowValues((prev) => ({
                            ...prev,
                            [col.name]: e.target.value,
                          }))
                        }
                        placeholder={
                          meta?.column_default
                            ? t("table.defaultValue", { value: meta.column_default })
                            : meta?.is_nullable
                              ? "NULL"
                              : ""
                        }
                        className="w-full rounded border border-border-primary bg-bg-primary px-2 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-muted/50 placeholder:italic focus:border-accent focus:outline-none"
                      />
                    )}
                  </div>
                );
              })}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={saveNewRow}
                  disabled={isSaving}
                  className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-black hover:bg-accent-hover disabled:opacity-50 transition-colors"
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  {tc("add")}
                </button>
                <button
                  onClick={() => setAddingRow(false)}
                  className="rounded-md px-3 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
                >
                  {tc("cancel")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer - Pagination & Info */}
      {data && (
        <div className="flex shrink-0 items-center justify-between border-t border-border-primary bg-bg-secondary px-4 py-2">
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <div className="flex items-center gap-1">
              <Rows3 className="h-3 w-3" />
              <span>{tc("rows", { count: data.total_rows })}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{data.execution_time_ms} ms</span>
            </div>
            <div className="mx-1 h-3 w-px bg-border-primary" />
            <button
              onClick={() => handleExport("csv")}
              disabled={isExporting}
              className="flex items-center gap-1 hover:text-text-primary transition-colors disabled:opacity-50"
              title={tc("exportCsv")}
            >
              <Download className="h-3 w-3" />
              CSV
            </button>
            <button
              onClick={() => handleExport("json")}
              disabled={isExporting}
              className="flex items-center gap-1 hover:text-text-primary transition-colors disabled:opacity-50"
              title={tc("exportJson")}
            >
              <Download className="h-3 w-3" />
              JSON
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">
              {tc("page", { current: page, total: totalPages || 1 })}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page <= 1}
                className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronsLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page >= totalPages}
                className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronsRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
