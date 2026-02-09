import { useState, useMemo, useEffect, useRef } from "react";
import {
  Search,
  Clock,
  Star,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Gauge,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useQueryHistoryStore } from "../stores/queryHistoryStore";
import { useTabStore } from "../stores/tabStore";

type FilterType = "all" | "favorites" | "errors" | "slow";

function formatDate(dateStr: string, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return t("common:justNow");
  if (diffMins < 60) return t("common:minutesAgo", { count: diffMins });
  if (diffHours < 24) return t("common:hoursAgo", { count: diffHours });
  if (diffDays < 7) return t("common:daysAgo", { count: diffDays });
  return date.toLocaleDateString();
}

function getDurationColor(ms: number): string {
  if (ms < 100) return "text-success bg-success/10";
  if (ms < 1000) return "text-warning bg-warning/10";
  return "text-danger bg-danger/10";
}

export default function QueryHistory() {
  const { t } = useTranslation("database");
  const { entries, isLoaded, loadHistory, toggleFavorite, deleteEntry, clearHistory } =
    useQueryHistoryStore();
  const { openQueryTab } = useTabStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load history on mount
  useEffect(() => {
    if (!isLoaded) {
      loadHistory();
    }
  }, [isLoaded, loadHistory]);

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [searchQuery]);

  const filtered = useMemo(() => {
    let items = entries;
    if (debouncedQuery) {
      const q = debouncedQuery.toLowerCase();
      items = items.filter((e) => e.sql.toLowerCase().includes(q));
    }
    switch (activeFilter) {
      case "favorites":
        return items.filter((e) => e.isFavorite);
      case "errors":
        return items.filter((e) => !e.success);
      case "slow":
        return items.filter((e) => e.durationMs >= 1000);
      default:
        return items;
    }
  }, [entries, debouncedQuery, activeFilter]);

  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: t("history.filterAll") },
    { key: "favorites", label: t("history.filterFavorites") },
    { key: "errors", label: t("history.filterErrors") },
    { key: "slow", label: t("history.filterSlow") },
  ];

  function handleClear() {
    if (window.confirm(t("history.clearConfirm"))) {
      clearHistory();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-primary bg-bg-secondary px-3 py-2">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("history.searchPlaceholder")}
            className="w-full rounded-md border border-border-primary bg-bg-primary py-1.5 pl-8 pr-3 text-xs text-text-primary placeholder-text-muted focus:border-accent focus:outline-none"
          />
        </div>

        {/* Filter chips */}
        <div className="flex items-center gap-1">
          {filters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveFilter(f.key)}
              className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                activeFilter === f.key
                  ? "bg-accent/15 text-accent font-medium"
                  : "text-text-muted hover:bg-bg-hover hover:text-text-secondary"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Clear button */}
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            className="rounded-md px-2.5 py-1 text-xs text-text-muted hover:bg-danger/10 hover:text-danger transition-colors"
          >
            {t("history.clearHistory")}
          </button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center text-text-muted">
            <div className="text-center">
              <Clock className="mx-auto h-10 w-10 mb-3" />
              <p className="text-sm">{t("history.empty")}</p>
              <p className="mt-1 text-xs">{t("history.emptyDesc")}</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border-primary">
            {filtered.map((entry) => (
              <div
                key={entry.id}
                onClick={() => openQueryTab(entry.sql)}
                className="group relative cursor-pointer px-4 py-3 hover:bg-bg-hover transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* Favorite star */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(entry.id);
                    }}
                    className={`mt-0.5 shrink-0 transition-colors ${
                      entry.isFavorite
                        ? "text-warning"
                        : "text-text-muted/30 hover:text-warning"
                    }`}
                  >
                    <Star
                      className="h-4 w-4"
                      fill={entry.isFavorite ? "currentColor" : "none"}
                    />
                  </button>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    {/* SQL preview */}
                    <pre className="font-mono text-xs text-text-primary line-clamp-2 whitespace-pre-wrap break-all">
                      {entry.sql}
                    </pre>

                    {/* Meta row */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
                      {/* Timestamp */}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(entry.timestamp, t)}
                      </span>

                      {/* Duration badge */}
                      <span
                        className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-medium ${getDurationColor(
                          entry.durationMs
                        )}`}
                      >
                        <Gauge className="h-3 w-3" />
                        {entry.durationMs} ms
                      </span>

                      {/* Row count */}
                      <span>{t("history.rowCount", { count: entry.rowCount })}</span>

                      {/* Connection + DB badge */}
                      <span className="rounded bg-bg-tertiary px-1.5 py-0.5 text-text-secondary">
                        {entry.connectionName}
                        {entry.database ? `/${entry.database}` : ""}
                      </span>

                      {/* Success/Error indicator */}
                      {entry.success ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      ) : (
                        <span className="flex items-center gap-0.5 text-danger">
                          <AlertCircle className="h-3.5 w-3.5" />
                          <span>{t("history.errorLabel")}</span>
                        </span>
                      )}
                    </div>

                    {/* Error message */}
                    {!entry.success && entry.errorMessage && (
                      <p className="mt-1 text-[11px] text-danger/80 line-clamp-1">
                        {entry.errorMessage}
                      </p>
                    )}
                  </div>

                  {/* Delete button (hover) */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteEntry(entry.id);
                    }}
                    className="shrink-0 rounded p-1 text-text-muted/30 opacity-0 group-hover:opacity-100 hover:bg-danger/10 hover:text-danger transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
