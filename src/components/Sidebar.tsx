import { useEffect, useState, useRef, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  Table2,
  Eye,
  FunctionSquare,
  Hash,
  Loader2,
  Layers,
  GitFork,
} from "lucide-react";
import { useConnectionStore } from "../stores/connectionStore";
import {
  useDatabaseStore,
  type TableInfo,
} from "../stores/databaseStore";
import { useTabStore } from "../stores/tabStore";
import { useTranslation } from "react-i18next";

export default function Sidebar() {
  const { t } = useTranslation("database");
  const { activeConnectionId } = useConnectionStore();
  const {
    schemas,
    tablesBySchema,
    functionsBySchema,
    sequencesBySchema,
    isLoadingSchemas,
    loadSchemas,
    loadTables,
    loadFunctions,
    loadSequences,
    loadCompletions,
  } = useDatabaseStore();
  const { tabs, activeTabId, openTableTab, openErDiagramTab } = useTabStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (activeConnectionId) {
      loadSchemas(activeConnectionId);
      loadCompletions(activeConnectionId);
    }
  }, [activeConnectionId]);

  // public şemasını otomatik aç
  useEffect(() => {
    if (schemas.length > 0 && expandedSchemas.size === 0) {
      const publicSchema = schemas.find((s) => s.name === "public");
      if (publicSchema) {
        toggleSchema(publicSchema.name);
      }
    }
  }, [schemas]);

  function toggleSchema(schemaName: string) {
    const next = new Set(expandedSchemas);
    if (next.has(schemaName)) {
      next.delete(schemaName);
    } else {
      next.add(schemaName);
      if (activeConnectionId && !tablesBySchema[schemaName]) {
        loadTables(activeConnectionId, schemaName);
        loadFunctions(activeConnectionId, schemaName);
        loadSequences(activeConnectionId, schemaName);
      }
    }
    setExpandedSchemas(next);
  }

  function toggleSection(key: string) {
    const next = new Set(expandedSections);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setExpandedSections(next);
  }

  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTableClick = useCallback(
    (schema: string, table: TableInfo) => {
      if (clickTimerRef.current) {
        // Double click — permanent tab
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
        openTableTab(schema, table.name, table.table_type as "table" | "view", false);
      } else {
        // Single click — preview tab (delayed)
        clickTimerRef.current = setTimeout(() => {
          clickTimerRef.current = null;
          openTableTab(schema, table.name, table.table_type as "table" | "view", true);
        }, 250);
      }
    },
    [openTableTab]
  );

  if (isLoadingSchemas) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto py-2 text-sm">
      {schemas.map((schema) => {
        const isExpanded = expandedSchemas.has(schema.name);
        const tables = tablesBySchema[schema.name] || [];
        const functions = functionsBySchema[schema.name] || [];
        const sequences = sequencesBySchema[schema.name] || [];

        const realTables = tables.filter((t) => t.table_type === "table");
        const views = tables.filter((t) => t.table_type === "view");

        const tablesKey = `${schema.name}:tables`;
        const viewsKey = `${schema.name}:views`;
        const functionsKey = `${schema.name}:functions`;
        const sequencesKey = `${schema.name}:sequences`;

        return (
          <div key={schema.name}>
            {/* Schema node */}
            <div className="group flex w-full items-center">
              <button
                onClick={() => toggleSchema(schema.name)}
                className="flex flex-1 items-center gap-1.5 px-3 py-1 text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                )}
                <Layers className="h-3.5 w-3.5 shrink-0 text-text-muted" />
                <span className="truncate">{schema.name}</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openErDiagramTab(schema.name);
                }}
                className="opacity-0 group-hover:opacity-100 mr-2 p-0.5 text-text-muted hover:text-accent rounded hover:bg-bg-hover transition-all"
                title={t("sidebar.erDiagram")}
              >
                <GitFork className="h-3 w-3" />
              </button>
            </div>

            {isExpanded && (
              <div className="ml-3">
                {/* Tables section */}
                {realTables.length > 0 && (
                  <SectionNode
                    label={t("sidebar.tables", { count: realTables.length })}

                    isExpanded={expandedSections.has(tablesKey)}
                    onToggle={() => toggleSection(tablesKey)}
                    defaultOpen
                  >
                    {realTables.map((table) => {
                      const isActive =
                        activeTab?.schema === schema.name &&
                        activeTab?.table === table.name;
                      return (
                        <button
                          key={table.name}
                          onClick={() => handleTableClick(schema.name, table)}
                          className={`flex w-full items-center gap-1.5 py-0.5 pl-8 pr-3 transition-colors ${
                            isActive
                              ? "bg-accent/15 text-accent"
                              : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                          }`}
                        >
                          <Table2 className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{table.name}</span>
                          <span className="ml-auto text-[10px] text-text-muted">
                            {table.estimated_rows > 0
                              ? `~${table.estimated_rows.toLocaleString()}`
                              : ""}
                          </span>
                        </button>
                      );
                    })}
                  </SectionNode>
                )}

                {/* Views section */}
                {views.length > 0 && (
                  <SectionNode
                    label={t("sidebar.views", { count: views.length })}

                    isExpanded={expandedSections.has(viewsKey)}
                    onToggle={() => toggleSection(viewsKey)}
                  >
                    {views.map((view) => {
                      const isActive =
                        activeTab?.schema === schema.name &&
                        activeTab?.table === view.name;
                      return (
                        <button
                          key={view.name}
                          onClick={() => handleTableClick(schema.name, view)}
                          className={`flex w-full items-center gap-1.5 py-0.5 pl-8 pr-3 transition-colors ${
                            isActive
                              ? "bg-accent/15 text-accent"
                              : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                          }`}
                        >
                          <Eye className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{view.name}</span>
                        </button>
                      );
                    })}
                  </SectionNode>
                )}

                {/* Functions section */}
                {functions.length > 0 && (
                  <SectionNode
                    label={t("sidebar.functions", { count: functions.length })}

                    isExpanded={expandedSections.has(functionsKey)}
                    onToggle={() => toggleSection(functionsKey)}
                  >
                    {functions.map((fn, i) => (
                      <div
                        key={`${fn.name}-${i}`}
                        className="flex items-center gap-1.5 py-0.5 pl-8 pr-3 text-text-muted"
                      >
                        <FunctionSquare className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate text-text-secondary">
                          {fn.name}
                          <span className="text-text-muted">
                            ({fn.argument_types})
                          </span>
                        </span>
                      </div>
                    ))}
                  </SectionNode>
                )}

                {/* Sequences section */}
                {sequences.length > 0 && (
                  <SectionNode
                    label={t("sidebar.sequences", { count: sequences.length })}

                    isExpanded={expandedSections.has(sequencesKey)}
                    onToggle={() => toggleSection(sequencesKey)}
                  >
                    {sequences.map((seq) => (
                      <div
                        key={seq.name}
                        className="flex items-center gap-1.5 py-0.5 pl-8 pr-3 text-text-muted"
                      >
                        <Hash className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate text-text-secondary">
                          {seq.name}
                        </span>
                      </div>
                    ))}
                  </SectionNode>
                )}

                {/* Loading placeholder */}
                {!tablesBySchema[schema.name] && (
                  <div className="flex items-center gap-2 px-6 py-1 text-text-muted">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span className="text-xs">{t("common:loading")}</span>
                  </div>
                )}

                {/* Empty state */}
                {tablesBySchema[schema.name] &&
                  realTables.length === 0 &&
                  views.length === 0 && (
                    <div className="px-6 py-1 text-xs text-text-muted">
                      {t("sidebar.emptySchema")}
                    </div>
                  )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SectionNode({
  label,
  isExpanded,
  onToggle,
  defaultOpen,
  children,
}: {
  label: string;
  isExpanded: boolean;
  onToggle: () => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [autoOpened, setAutoOpened] = useState(false);

  useEffect(() => {
    if (defaultOpen && !autoOpened) {
      onToggle();
      setAutoOpened(true);
    }
  }, [defaultOpen]);

  return (
    <div>
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 px-3 py-0.5 text-text-muted hover:bg-bg-hover hover:text-text-secondary transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span className="text-xs">{label}</span>
      </button>
      {isExpanded && children}
    </div>
  );
}
