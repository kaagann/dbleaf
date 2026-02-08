import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Loader2,
  Key,
  Columns3,
  GitFork,
  List,
  Check,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useConnectionStore } from "../stores/connectionStore";
import type {
  ColumnInfo,
  IndexInfo,
  ForeignKeyInfo,
} from "../stores/databaseStore";

interface Props {
  schema: string;
  table: string;
}

type StructureTab = "columns" | "indexes" | "foreign_keys";

export default function TableStructure({ schema, table }: Props) {
  const { t } = useTranslation("database");
  const { activeConnectionId } = useConnectionStore();
  const [activeTab, setActiveTab] = useState<StructureTab>("columns");
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [foreignKeys, setForeignKeys] = useState<ForeignKeyInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activeConnectionId) return;
    setIsLoading(true);
    setError(null);

    Promise.all([
      invoke<ColumnInfo[]>("list_columns", {
        connectionId: activeConnectionId,
        schema,
        table,
      }),
      invoke<IndexInfo[]>("list_indexes", {
        connectionId: activeConnectionId,
        schema,
        table,
      }),
      invoke<ForeignKeyInfo[]>("list_foreign_keys", {
        connectionId: activeConnectionId,
        schema,
        table,
      }),
    ])
      .then(([cols, idxs, fks]) => {
        setColumns(cols);
        setIndexes(idxs);
        setForeignKeys(fks);
      })
      .catch((err) => {
        setError(err?.toString() || t("structure.loadError"));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [activeConnectionId, schema, table]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-danger">
          <p className="text-sm font-medium">{t("common:error")}</p>
          <p className="mt-1 text-xs text-text-muted">{error}</p>
        </div>
      </div>
    );
  }

  const tabs: { key: StructureTab; label: string; icon: typeof Columns3; count: number }[] = [
    { key: "columns", label: t("structure.columns"), icon: Columns3, count: columns.length },
    { key: "indexes", label: t("structure.indexes"), icon: List, count: indexes.length },
    { key: "foreign_keys", label: t("structure.foreignKeys"), icon: GitFork, count: foreignKeys.length },
  ];

  return (
    <div className="flex h-full flex-col">
      {/* Sub-tabs */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border-primary bg-bg-secondary px-3 py-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors ${
              activeTab === tab.key
                ? "bg-bg-active text-text-primary"
                : "text-text-muted hover:bg-bg-hover hover:text-text-secondary"
            }`}
          >
            <tab.icon className="h-3 w-3" />
            {tab.label}
            <span className="text-[10px] text-text-muted">({tab.count})</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === "columns" && <ColumnsTable columns={columns} />}
        {activeTab === "indexes" && <IndexesTable indexes={indexes} />}
        {activeTab === "foreign_keys" && <ForeignKeysTable foreignKeys={foreignKeys} />}
      </div>
    </div>
  );
}

function ColumnsTable({ columns }: { columns: ColumnInfo[] }) {
  const { t } = useTranslation("database");
  if (columns.length === 0) {
    return <EmptyState message={t("structure.noCols")} />;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-bg-secondary">
        <tr>
          <th className="w-10 border-b border-r border-border-primary px-2 py-1.5 text-center text-xs font-medium text-text-muted">
            #
          </th>
          <th className="border-b border-r border-border-primary px-3 py-1.5 text-left text-xs font-medium text-text-secondary">
            {t("structure.colName")}
          </th>
          <th className="border-b border-r border-border-primary px-3 py-1.5 text-left text-xs font-medium text-text-secondary">
            {t("structure.dataType")}
          </th>
          <th className="w-20 border-b border-r border-border-primary px-3 py-1.5 text-center text-xs font-medium text-text-secondary">
            Nullable
          </th>
          <th className="border-b border-r border-border-primary px-3 py-1.5 text-left text-xs font-medium text-text-secondary">
            {t("structure.defaultVal")}
          </th>
          <th className="w-16 border-b border-border-primary px-3 py-1.5 text-center text-xs font-medium text-text-secondary">
            PK
          </th>
        </tr>
      </thead>
      <tbody>
        {columns.map((col) => (
          <tr
            key={col.name}
            className="hover:bg-bg-hover/50 transition-colors"
          >
            <td className="border-b border-r border-border-primary px-2 py-1.5 text-center text-xs text-text-muted">
              {col.ordinal_position}
            </td>
            <td className="border-b border-r border-border-primary px-3 py-1.5 text-xs">
              <div className="flex items-center gap-1.5">
                {col.is_primary_key && (
                  <Key className="h-3 w-3 text-warning shrink-0" />
                )}
                <span className={`font-mono ${col.is_primary_key ? "text-warning" : "text-text-primary"}`}>
                  {col.name}
                </span>
              </div>
            </td>
            <td className="border-b border-r border-border-primary px-3 py-1.5 font-mono text-xs text-accent">
              {col.data_type}
            </td>
            <td className="border-b border-r border-border-primary px-3 py-1.5 text-center">
              {col.is_nullable ? (
                <Check className="mx-auto h-3.5 w-3.5 text-success" />
              ) : (
                <X className="mx-auto h-3.5 w-3.5 text-danger" />
              )}
            </td>
            <td className="border-b border-r border-border-primary px-3 py-1.5 font-mono text-xs text-text-muted max-w-xs truncate">
              {col.column_default || (
                <span className="italic">—</span>
              )}
            </td>
            <td className="border-b border-border-primary px-3 py-1.5 text-center">
              {col.is_primary_key && (
                <Key className="mx-auto h-3.5 w-3.5 text-warning" />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function IndexesTable({ indexes }: { indexes: IndexInfo[] }) {
  const { t } = useTranslation("database");
  if (indexes.length === 0) {
    return <EmptyState message={t("structure.noIndexes")} />;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-bg-secondary">
        <tr>
          <th className="border-b border-r border-border-primary px-3 py-1.5 text-left text-xs font-medium text-text-secondary">
            {t("structure.indexName")}
          </th>
          <th className="border-b border-r border-border-primary px-3 py-1.5 text-left text-xs font-medium text-text-secondary">
            {t("structure.indexColumns")}
          </th>
          <th className="border-b border-r border-border-primary px-3 py-1.5 text-left text-xs font-medium text-text-secondary">
            {t("structure.indexType")}
          </th>
          <th className="w-20 border-b border-r border-border-primary px-3 py-1.5 text-center text-xs font-medium text-text-secondary">
            Unique
          </th>
          <th className="w-20 border-b border-border-primary px-3 py-1.5 text-center text-xs font-medium text-text-secondary">
            Primary
          </th>
        </tr>
      </thead>
      <tbody>
        {indexes.map((idx) => (
          <tr
            key={idx.name}
            className="hover:bg-bg-hover/50 transition-colors"
          >
            <td className="border-b border-r border-border-primary px-3 py-1.5 font-mono text-xs text-text-primary">
              {idx.name}
            </td>
            <td className="border-b border-r border-border-primary px-3 py-1.5 font-mono text-xs text-accent">
              {idx.columns}
            </td>
            <td className="border-b border-r border-border-primary px-3 py-1.5 text-xs text-text-muted uppercase">
              {idx.index_type}
            </td>
            <td className="border-b border-r border-border-primary px-3 py-1.5 text-center">
              {idx.is_unique ? (
                <Check className="mx-auto h-3.5 w-3.5 text-success" />
              ) : (
                <X className="mx-auto h-3.5 w-3.5 text-text-muted/30" />
              )}
            </td>
            <td className="border-b border-border-primary px-3 py-1.5 text-center">
              {idx.is_primary ? (
                <Key className="mx-auto h-3.5 w-3.5 text-warning" />
              ) : (
                <X className="mx-auto h-3.5 w-3.5 text-text-muted/30" />
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ForeignKeysTable({ foreignKeys }: { foreignKeys: ForeignKeyInfo[] }) {
  const { t } = useTranslation("database");
  if (foreignKeys.length === 0) {
    return <EmptyState message={t("structure.noForeignKeys")} />;
  }

  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-bg-secondary">
        <tr>
          <th className="border-b border-r border-border-primary px-3 py-1.5 text-left text-xs font-medium text-text-secondary">
            {t("structure.fkName")}
          </th>
          <th className="border-b border-r border-border-primary px-3 py-1.5 text-left text-xs font-medium text-text-secondary">
            {t("structure.fkColumn")}
          </th>
          <th className="border-b border-r border-border-primary px-3 py-1.5 text-left text-xs font-medium text-text-secondary">
            {t("structure.fkRefTable")}
          </th>
          <th className="border-b border-border-primary px-3 py-1.5 text-left text-xs font-medium text-text-secondary">
            {t("structure.fkRefColumn")}
          </th>
        </tr>
      </thead>
      <tbody>
        {foreignKeys.map((fk, i) => (
          <tr
            key={`${fk.name}-${i}`}
            className="hover:bg-bg-hover/50 transition-colors"
          >
            <td className="border-b border-r border-border-primary px-3 py-1.5 font-mono text-xs text-text-primary">
              {fk.name}
            </td>
            <td className="border-b border-r border-border-primary px-3 py-1.5 font-mono text-xs text-accent">
              {fk.column_name}
            </td>
            <td className="border-b border-r border-border-primary px-3 py-1.5 font-mono text-xs text-text-secondary">
              {fk.foreign_table_schema}.{fk.foreign_table_name}
            </td>
            <td className="border-b border-border-primary px-3 py-1.5 font-mono text-xs text-accent">
              {fk.foreign_column_name}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center py-12">
      <p className="text-xs text-text-muted">{message}</p>
    </div>
  );
}
