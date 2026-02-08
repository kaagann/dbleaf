import { useState } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  HardDriveDownload,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useConnectionStore } from "../stores/connectionStore";

interface Props {
  onClose: () => void;
}

type BackupFormat = "sql" | "custom" | "tar";

const formatOptions: { value: BackupFormat; label: string; ext: string }[] = [
  { value: "sql", label: "SQL", ext: ".sql" },
  { value: "custom", label: "Custom", ext: ".dump" },
  { value: "tar", label: "Tar", ext: ".tar" },
];

export default function BackupDialog({ onClose }: Props) {
  const { t } = useTranslation("backup");
  const { connections, activeConnectionId } = useConnectionStore();
  const [format, setFormat] = useState<BackupFormat>("sql");

  const formatDescs: Record<BackupFormat, string> = {
    sql: t("backup.sqlFormat"),
    custom: t("backup.customFormat"),
    tar: t("backup.tarFormat"),
  };
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const activeConnection = connections.find((c) => c.id === activeConnectionId);

  async function handleBackup() {
    if (!activeConnection) return;

    const selectedFormat = formatOptions.find((f) => f.value === format)!;
    const filePath = await save({
      title: t("backup.saveDialog"),
      defaultPath: `${activeConnection.database}_backup${selectedFormat.ext}`,
      filters: [
        {
          name: selectedFormat.label,
          extensions: [selectedFormat.ext.replace(".", "")],
        },
      ],
    });

    if (!filePath) return;

    setIsRunning(true);
    setResult(null);

    try {
      const config = {
        id: activeConnection.id,
        name: activeConnection.name,
        host: activeConnection.host,
        port: activeConnection.port,
        username: activeConnection.username,
        password: activeConnection.password,
        database: activeConnection.database,
        ssl_mode: activeConnection.sslMode,
        color: activeConnection.color,
        last_connected_at: activeConnection.lastConnectedAt || null,
        created_at: activeConnection.createdAt,
      };

      const res = await invoke<{ success: boolean; message: string; file_path: string }>(
        "backup_database",
        { config, format, outputPath: filePath }
      );

      setResult({ success: res.success, message: res.message });
    } catch (err: any) {
      setResult({ success: false, message: err?.toString() || t("backup.error") });
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[480px] rounded-xl border border-border-primary bg-bg-secondary shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-primary px-5 py-4">
          <div className="flex items-center gap-2">
            <HardDriveDownload className="h-5 w-5 text-accent" />
            <h2 className="text-sm font-semibold text-text-primary">
              {t("backup.title")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Connection info */}
          {activeConnection && (
            <div className="rounded-lg bg-bg-primary px-3 py-2 text-xs">
              <span className="text-text-muted">{t("backup.dbLabel")} </span>
              <span className="font-mono text-text-primary">
                {activeConnection.host}:{activeConnection.port}/{activeConnection.database}
              </span>
            </div>
          )}

          {/* Format selection */}
          <div>
            <label className="mb-2 block text-xs font-medium text-text-secondary">
              {t("backup.formatLabel")}
            </label>
            <div className="space-y-2">
              {formatOptions.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                    format === opt.value
                      ? "border-accent bg-accent/10"
                      : "border-border-primary hover:border-border-secondary"
                  }`}
                >
                  <input
                    type="radio"
                    name="format"
                    value={opt.value}
                    checked={format === opt.value}
                    onChange={() => setFormat(opt.value)}
                    className="sr-only"
                  />
                  <div
                    className={`h-3.5 w-3.5 rounded-full border-2 ${
                      format === opt.value
                        ? "border-accent bg-accent"
                        : "border-text-muted"
                    }`}
                  >
                    {format === opt.value && (
                      <div className="m-auto mt-[3px] h-1.5 w-1.5 rounded-full bg-black" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-medium text-text-primary">
                      {opt.label}{" "}
                      <span className="font-mono text-text-muted">({opt.ext})</span>
                    </div>
                    <div className="text-[10px] text-text-muted">{formatDescs[opt.value]}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Result message */}
          {result && (
            <div
              className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs ${
                result.success
                  ? "bg-success/10 text-success"
                  : "bg-danger/10 text-danger"
              }`}
            >
              {result.success ? (
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              ) : (
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              )}
              <pre className="whitespace-pre-wrap font-mono leading-relaxed">
                {result.message}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border-primary px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            {t("common:close")}
          </button>
          <button
            onClick={handleBackup}
            disabled={isRunning}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-black hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <HardDriveDownload className="h-3.5 w-3.5" />
            )}
            {isRunning ? t("backup.running") : t("backup.button")}
          </button>
        </div>
      </div>
    </div>
  );
}
