import { useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  HardDriveUpload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileArchive,
} from "lucide-react";
import { useConnectionStore } from "../stores/connectionStore";

interface Props {
  onClose: () => void;
}

export default function RestoreDialog({ onClose }: Props) {
  const { t } = useTranslation("backup");
  const { connections, activeConnectionId } = useConnectionStore();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const activeConnection = connections.find((c) => c.id === activeConnectionId);

  async function handleSelectFile() {
    const filePath = await open({
      title: t("restore.selectFile"),
      multiple: false,
      filters: [
        {
          name: t("restore.fileBackups"),
          extensions: ["sql", "dump", "tar", "backup"],
        },
      ],
    });

    if (filePath) {
      setSelectedFile(filePath as string);
      setResult(null);
    }
  }

  async function handleRestore() {
    if (!activeConnection || !selectedFile) return;

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

      const res = await invoke<{ success: boolean; message: string }>(
        "restore_database",
        { config, inputPath: selectedFile }
      );

      setResult({ success: res.success, message: res.message });
    } catch (err: any) {
      setResult({ success: false, message: err?.toString() || t("restore.error") });
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
            <HardDriveUpload className="h-5 w-5 text-warning" />
            <h2 className="text-sm font-semibold text-text-primary">
              {t("restore.title")}
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
              <span className="text-text-muted">{t("restore.targetDb")} </span>
              <span className="font-mono text-text-primary">
                {activeConnection.host}:{activeConnection.port}/{activeConnection.database}
              </span>
            </div>
          )}

          {/* Warning */}
          <div className="flex items-start gap-2 rounded-lg bg-warning/10 px-3 py-2.5 text-xs text-warning">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {t("restore.warning")}
            </span>
          </div>

          {/* File selection */}
          <div>
            <label className="mb-2 block text-xs font-medium text-text-secondary">
              {t("restore.fileLabel")}
            </label>
            <button
              onClick={handleSelectFile}
              className="flex w-full items-center gap-2 rounded-lg border border-border-primary px-3 py-2.5 text-xs text-text-secondary hover:border-border-secondary hover:bg-bg-hover transition-colors"
            >
              <FileArchive className="h-4 w-4 text-text-muted shrink-0" />
              {selectedFile ? (
                <span className="font-mono text-text-primary truncate">
                  {selectedFile}
                </span>
              ) : (
                <span className="text-text-muted">{t("restore.filePlaceholder")}</span>
              )}
            </button>
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
            onClick={handleRestore}
            disabled={isRunning || !selectedFile}
            className="flex items-center gap-1.5 rounded-lg bg-warning px-4 py-1.5 text-xs font-medium text-black hover:bg-warning/80 disabled:opacity-50 transition-colors"
          >
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <HardDriveUpload className="h-3.5 w-3.5" />
            )}
            {isRunning ? t("restore.running") : t("restore.button")}
          </button>
        </div>
      </div>
    </div>
  );
}
