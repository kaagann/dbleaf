import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  Search,
  Table2,
  Eye,
  Braces,
  Hash,
  Zap,
  TerminalSquare,
  Columns3,
  History,
  Play,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useDatabaseStore } from "../stores/databaseStore";
import { useTabStore } from "../stores/tabStore";
import { useConnectionStore } from "../stores/connectionStore";

interface QueryColumn {
  name: string;
  data_type: string;
}

interface QuickQueryResult {
  columns: QueryColumn[];
  rows: any[][];
  row_count: number;
  execution_time_ms: number;
  is_select: boolean;
  affected_rows?: number;
}

interface PaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  category: "table" | "view" | "function" | "sequence" | "tab" | "action";
  shortcut?: string;
  onSelect: () => void;
}

const CATEGORY_ORDER: PaletteItem["category"][] = [
  "table",
  "view",
  "function",
  "sequence",
  "tab",
  "action",
];

const SQL_KEYWORDS = /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER|DROP|EXPLAIN|TRUNCATE|BEGIN|COMMIT|ROLLBACK|GRANT|REVOKE|SHOW)\b/i;

const MAX_PREVIEW_ROWS = 10;

function getCategoryIcon(category: PaletteItem["category"]) {
  switch (category) {
    case "table":
      return <Table2 className="h-3.5 w-3.5" />;
    case "view":
      return <Eye className="h-3.5 w-3.5" />;
    case "function":
      return <Braces className="h-3.5 w-3.5" />;
    case "sequence":
      return <Hash className="h-3.5 w-3.5" />;
    case "tab":
      return <TerminalSquare className="h-3.5 w-3.5" />;
    case "action":
      return <Zap className="h-3.5 w-3.5" />;
  }
}

function getTabIcon(tabType?: string) {
  switch (tabType) {
    case "table":
      return <Table2 className="h-3.5 w-3.5" />;
    case "query":
      return <TerminalSquare className="h-3.5 w-3.5" />;
    case "structure":
      return <Columns3 className="h-3.5 w-3.5" />;
    case "history":
      return <History className="h-3.5 w-3.5" />;
    default:
      return <TerminalSquare className="h-3.5 w-3.5" />;
  }
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function CommandPalette({ isOpen, onClose }: Props) {
  const { t } = useTranslation("database");
  const { tablesBySchema, functionsBySchema, sequencesBySchema } =
    useDatabaseStore();
  const { tabs, openTableTab, openQueryTab, openHistoryTab, setActiveTab, closeAllTabs } =
    useTabStore();
  const { activeConnectionId } = useConnectionStore();

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Quick query state
  const [quickResult, setQuickResult] = useState<QuickQueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [quickError, setQuickError] = useState<string | null>(null);

  const isSql = useMemo(() => SQL_KEYWORDS.test(query), [query]);

  const executeQuickQuery = useCallback(async () => {
    if (!activeConnectionId || !query.trim()) return;
    setIsExecuting(true);
    setQuickError(null);
    setQuickResult(null);
    try {
      const res = await invoke<QuickQueryResult>("execute_query", {
        connectionId: activeConnectionId,
        sql: query.trim(),
      });
      setQuickResult(res);
    } catch (err: any) {
      setQuickError(typeof err === "string" ? err : err.message || String(err));
    } finally {
      setIsExecuting(false);
    }
  }, [activeConnectionId, query]);

  // Build full item list from stores
  const items = useMemo(() => {
    const list: PaletteItem[] = [];

    // If SQL mode, show SQL actions first
    if (isSql) {
      list.push(
        {
          id: "sql-run",
          title: t("palette.runQuery"),
          subtitle: t("palette.runQueryHint"),
          category: "action",
          shortcut: "↵",
          onSelect: () => executeQuickQuery(),
        },
        {
          id: "sql-open-editor",
          title: t("palette.openInEditorAction"),
          category: "action",
          shortcut: "⌘↵",
          onSelect: () => {
            openQueryTab(query.trim());
            onClose();
          },
        }
      );
      return list;
    }

    // 1. Tables
    for (const [schema, tables] of Object.entries(tablesBySchema)) {
      for (const tbl of tables) {
        if (tbl.table_type === "view") continue;
        list.push({
          id: `table-${schema}-${tbl.name}`,
          title: `${schema}.${tbl.name}`,
          subtitle: t("palette.rows", { count: tbl.estimated_rows }),
          category: "table",
          onSelect: () => {
            openTableTab(schema, tbl.name, "table", false);
            onClose();
          },
        });
      }
    }

    // 2. Views
    for (const [schema, tables] of Object.entries(tablesBySchema)) {
      for (const tbl of tables) {
        if (tbl.table_type !== "view") continue;
        list.push({
          id: `view-${schema}-${tbl.name}`,
          title: `${schema}.${tbl.name}`,
          category: "view",
          onSelect: () => {
            openTableTab(schema, tbl.name, "view", false);
            onClose();
          },
        });
      }
    }

    // 3. Functions
    for (const [schema, funcs] of Object.entries(functionsBySchema)) {
      for (const f of funcs) {
        list.push({
          id: `func-${schema}-${f.name}`,
          title: `${schema}.${f.name}(${f.argument_types})`,
          subtitle: `→ ${f.return_type}`,
          category: "function",
          onSelect: () => {
            openQueryTab(`SELECT ${schema}.${f.name}()`);
            onClose();
          },
        });
      }
    }

    // 4. Sequences
    for (const [schema, seqs] of Object.entries(sequencesBySchema)) {
      for (const s of seqs) {
        list.push({
          id: `seq-${schema}-${s.name}`,
          title: `${schema}.${s.name}`,
          category: "sequence",
          onSelect: () => {
            openQueryTab(`SELECT nextval('${schema}.${s.name}')`);
            onClose();
          },
        });
      }
    }

    // 5. Open tabs
    for (const tab of tabs) {
      list.push({
        id: `tab-${tab.id}`,
        title: tab.title,
        subtitle: t("palette.switchTab"),
        category: "tab",
        onSelect: () => {
          setActiveTab(tab.id);
          onClose();
        },
      });
    }

    // 6. Actions
    list.push(
      {
        id: "action-new-query",
        title: t("palette.newQuery"),
        category: "action",
        shortcut: "⌘T",
        onSelect: () => {
          openQueryTab();
          onClose();
        },
      },
      {
        id: "action-history",
        title: t("palette.openHistory"),
        category: "action",
        shortcut: "⌘Y",
        onSelect: () => {
          openHistoryTab();
          onClose();
        },
      },
      {
        id: "action-close-all",
        title: t("palette.closeAllTabs"),
        category: "action",
        onSelect: () => {
          closeAllTabs();
          onClose();
        },
      }
    );

    return list;
  }, [tablesBySchema, functionsBySchema, sequencesBySchema, tabs, t, onClose, isSql, query, executeQuickQuery]);

  // Filter items
  const filtered = useMemo(() => {
    if (isSql || !query) return items;
    const q = query.toLowerCase();
    return items.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle?.toLowerCase().includes(q)
    );
  }, [items, query, isSql]);

  // Group filtered items by category
  const grouped = useMemo(() => {
    const groups: { category: PaletteItem["category"]; items: PaletteItem[] }[] = [];
    for (const cat of CATEGORY_ORDER) {
      const catItems = filtered.filter((item) => item.category === cat);
      if (catItems.length > 0) {
        groups.push({ category: cat, items: catItems });
      }
    }
    return groups;
  }, [filtered]);

  // Flat list for keyboard navigation
  const flatFiltered = useMemo(() => {
    return grouped.flatMap((g) => g.items);
  }, [grouped]);

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setQuickResult(null);
      setQuickError(null);
      setIsExecuting(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  // Scroll selected item into view
  useEffect(() => {
    const el = itemRefs.current.get(selectedIndex);
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Cmd+Enter → open in editor
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && isSql) {
        e.preventDefault();
        openQueryTab(query.trim());
        onClose();
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, flatFiltered.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (flatFiltered[selectedIndex]) {
            flatFiltered[selectedIndex].onSelect();
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    },
    [flatFiltered, selectedIndex, onClose, isSql, query, openQueryTab]
  );

  if (!isOpen) return null;

  let flatIdx = 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/50" onClick={onClose}>
      <div
        className="mt-[12%] h-fit w-full max-w-lg rounded-xl border border-border-primary bg-bg-secondary shadow-2xl flex flex-col"
        style={{ maxHeight: "70vh" }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-border-primary px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("palette.placeholder")}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder-text-muted outline-none"
          />
          {isSql && (
            <span className="shrink-0 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              SQL
            </span>
          )}
          <kbd className="rounded border border-border-primary bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted">
            ESC
          </kbd>
        </div>

        {/* Results / Items */}
        <div ref={listRef} className="overflow-y-auto py-1" style={{ maxHeight: quickResult || quickError ? "200px" : "400px" }}>
          {flatFiltered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-text-muted">
              {t("palette.noResults")}
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.category}>
                {/* Category header */}
                <div className="sticky top-0 bg-bg-secondary px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                  {t(`palette.categories.${group.category}`)}
                </div>

                {/* Items */}
                {group.items.map((item) => {
                  const currentIdx = flatIdx++;
                  const isSelected = currentIdx === selectedIndex;

                  return (
                    <div
                      key={item.id}
                      ref={(el) => {
                        if (el) itemRefs.current.set(currentIdx, el);
                      }}
                      onClick={() => item.onSelect()}
                      onMouseEnter={() => setSelectedIndex(currentIdx)}
                      className={`flex cursor-pointer items-center gap-3 px-4 py-2 transition-colors ${
                        isSelected
                          ? "bg-accent/10 text-text-primary"
                          : "text-text-secondary hover:bg-bg-hover"
                      }`}
                    >
                      {/* Icon */}
                      <span
                        className={
                          isSelected ? "text-accent" : "text-text-muted"
                        }
                      >
                        {item.id === "sql-run" ? (
                          <Play className="h-3.5 w-3.5" />
                        ) : item.id === "sql-open-editor" ? (
                          <ExternalLink className="h-3.5 w-3.5" />
                        ) : item.category === "tab" ? (
                          getTabIcon(
                            tabs.find((t) => `tab-${t.id}` === item.id)?.type
                          )
                        ) : (
                          getCategoryIcon(item.category)
                        )}
                      </span>

                      {/* Title + subtitle */}
                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-mono truncate block">
                          {item.title}
                        </span>
                        {item.subtitle && (
                          <span className="text-[11px] text-text-muted">
                            {item.subtitle}
                          </span>
                        )}
                      </div>

                      {/* Shortcut badge */}
                      {item.shortcut && (
                        <kbd className="shrink-0 rounded border border-border-primary bg-bg-tertiary px-1.5 py-0.5 text-[10px] text-text-muted">
                          {item.shortcut}
                        </kbd>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Executing indicator */}
        {isExecuting && (
          <div className="border-t border-border-primary px-4 py-3 flex items-center gap-2 text-text-muted">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">{t("palette.executing")}</span>
          </div>
        )}

        {/* Quick query error */}
        {quickError && (
          <div className="border-t border-border-primary px-4 py-3">
            <p className="text-xs text-red-400 font-mono break-all">{quickError}</p>
          </div>
        )}

        {/* Quick query results */}
        {quickResult && (
          <div className="border-t border-border-primary flex flex-col overflow-hidden">
            {/* Results header */}
            <div className="flex items-center justify-between px-3 py-1.5 text-[10px] text-text-muted">
              <span className="font-semibold uppercase tracking-wider">
                {t("palette.quickResults")}
              </span>
              <span>
                {quickResult.is_select
                  ? t("palette.resultRows", { count: quickResult.row_count })
                  : t("palette.resultAffected", { count: quickResult.affected_rows ?? 0 })}
                {" · "}
                {quickResult.execution_time_ms}ms
              </span>
            </div>

            {/* Compact result table */}
            {quickResult.is_select && quickResult.columns.length > 0 && (
              <div className="overflow-auto" style={{ maxHeight: "200px" }}>
                <table className="w-full text-[11px] font-mono">
                  <thead>
                    <tr className="border-b border-border-primary bg-bg-tertiary">
                      {quickResult.columns.map((col) => (
                        <th
                          key={col.name}
                          className="px-2 py-1 text-left font-semibold text-text-muted whitespace-nowrap"
                        >
                          {col.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {quickResult.rows.slice(0, MAX_PREVIEW_ROWS).map((row, ri) => (
                      <tr
                        key={ri}
                        className="border-b border-border-primary/50 hover:bg-bg-hover"
                      >
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="px-2 py-1 text-text-secondary whitespace-nowrap max-w-[200px] truncate"
                          >
                            {cell === null ? (
                              <span className="text-text-muted italic">NULL</span>
                            ) : (
                              String(cell)
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {quickResult.row_count > MAX_PREVIEW_ROWS && (
                  <div className="px-3 py-1.5 text-[10px] text-text-muted text-center">
                    {t("palette.moreRows", { count: quickResult.row_count - MAX_PREVIEW_ROWS })}
                  </div>
                )}
              </div>
            )}

            {/* Open full results in editor */}
            <button
              onClick={() => {
                openQueryTab(query.trim());
                onClose();
              }}
              className="flex items-center justify-center gap-1.5 border-t border-border-primary px-3 py-2 text-[11px] text-accent hover:bg-bg-hover transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              {t("palette.openFullResults")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
