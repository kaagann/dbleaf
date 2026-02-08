import { Server, Pencil, Trash2, Clock, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ConnectionConfig, ConnectionColor } from "../types/connection";

const colorMap: Record<ConnectionColor, string> = {
  red: "bg-conn-red",
  orange: "bg-conn-orange",
  yellow: "bg-conn-yellow",
  green: "bg-conn-green",
  blue: "bg-conn-blue",
  purple: "bg-conn-purple",
  pink: "bg-conn-pink",
  gray: "bg-conn-gray",
};

interface Props {
  connection: ConnectionConfig;
  onConnect: (conn: ConnectionConfig) => void;
  onEdit: (conn: ConnectionConfig) => void;
  onDelete: (id: string) => void;
  isConnecting?: boolean;
}

export default function ConnectionCard({
  connection,
  onConnect,
  onEdit,
  onDelete,
  isConnecting,
}: Props) {
  const { t } = useTranslation("common");

  function formatDate(dateStr?: string): string {
    if (!dateStr) return t("neverConnected");
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return t("justNow");
    if (diffMins < 60) return t("minutesAgo", { count: diffMins });
    if (diffHours < 24) return t("hoursAgo", { count: diffHours });
    if (diffDays < 7) return t("daysAgo", { count: diffDays });
    return date.toLocaleDateString();
  }

  return (
    <div
      onClick={() => onConnect(connection)}
      className="group relative cursor-pointer rounded-xl border border-border-primary bg-bg-secondary p-4 transition-all hover:border-border-secondary hover:bg-bg-hover hover:shadow-lg"
    >
      {/* Color bar */}
      <div
        className={`absolute left-0 top-3 bottom-3 w-1 rounded-r-full ${colorMap[connection.color]}`}
      />

      <div className="flex items-start gap-3 pl-2">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-tertiary">
          {isConnecting ? (
            <Loader2 className="h-5 w-5 animate-spin text-accent" />
          ) : (
            <Server className="h-5 w-5 text-text-secondary" />
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-medium text-text-primary">
            {connection.name}
          </h3>
          <p className="mt-0.5 truncate font-mono text-xs text-text-muted">
            {connection.host}:{connection.port}
            {connection.database ? `/${connection.database}` : ""}
          </p>
          <div className="mt-2 flex items-center gap-1 text-xs text-text-muted">
            <Clock className="h-3 w-3" />
            <span>{formatDate(connection.lastConnectedAt)}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(connection);
            }}
            className="rounded-lg p-1.5 text-text-muted hover:bg-bg-active hover:text-text-primary transition-colors"
            title={t("edit")}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(connection.id);
            }}
            className="rounded-lg p-1.5 text-text-muted hover:bg-danger/20 hover:text-danger transition-colors"
            title={t("delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
