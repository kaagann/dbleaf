import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Database,
  LogOut,
  HardDriveDownload,
  HardDriveUpload,
  Globe,
  Lock,
  Bot,
} from "lucide-react";
import { useConnectionStore } from "../stores/connectionStore";
import { useAiStore } from "../stores/aiStore";
import { useDatabaseStore } from "../stores/databaseStore";
import type { ConnectionColor } from "../types/connection";
import BackupDialog from "./BackupDialog";
import RestoreDialog from "./RestoreDialog";
import i18n, { LANGUAGES } from "../i18n";

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

export default function TopBar() {
  const navigate = useNavigate();
  const { t } = useTranslation("backup");
  const { t: tc } = useTranslation("connection");
  const { connections, activeConnectionId, disconnectFromDb } =
    useConnectionStore();
  const { reset } = useDatabaseStore();
  const { isPanelOpen, togglePanel: toggleAiPanel } = useAiStore();
  const [showBackup, setShowBackup] = useState(false);
  const [showRestore, setShowRestore] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // Close language menu on outside click
  useEffect(() => {
    if (!showLangMenu) return;
    function handleClick(e: MouseEvent) {
      if (langMenuRef.current && !langMenuRef.current.contains(e.target as Node)) {
        setShowLangMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showLangMenu]);

  const activeConnection = connections.find(
    (c) => c.id === activeConnectionId
  );

  useEffect(() => {
    if (activeConnection) {
      const db = activeConnection.database || "postgres";
      getCurrentWindow().setTitle(
        `PG Manager — ${activeConnection.name} (${activeConnection.host}/${db})`
      );
    }
    return () => {
      getCurrentWindow().setTitle("PG Manager");
    };
  }, [activeConnection?.name, activeConnection?.host, activeConnection?.database]);

  async function handleDisconnect() {
    if (activeConnectionId) {
      try {
        await disconnectFromDb(activeConnectionId);
      } catch {
        // ignore
      }
    }
    reset();
    navigate("/");
  }

  if (!activeConnection) return null;

  return (
    <>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border-primary bg-bg-secondary px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`h-2.5 w-2.5 rounded-full ${colorMap[activeConnection.color]}`}
            />
            <span className="text-sm font-medium text-text-primary">
              {activeConnection.name}
            </span>
          </div>
          <span className="text-xs text-text-muted">|</span>
          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <Database className="h-3 w-3" />
            <span className="font-mono">
              {activeConnection.host}:{activeConnection.port}
              {activeConnection.database
                ? `/${activeConnection.database}`
                : ""}
            </span>
          </div>
          {activeConnection.useSshTunnel && (
            <>
              <span className="text-xs text-text-muted">|</span>
              <div className="flex items-center gap-1 text-xs text-accent">
                <Lock className="h-3 w-3" />
                <span>SSH</span>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowBackup(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
            title={t("topBar.backupTitle")}
          >
            <HardDriveDownload className="h-3.5 w-3.5" />
            {t("topBar.backupButton")}
          </button>
          <button
            onClick={() => setShowRestore(true)}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
            title={t("topBar.restoreTitle")}
          >
            <HardDriveUpload className="h-3.5 w-3.5" />
            {t("topBar.restoreButton")}
          </button>
          <div className="mx-1 h-4 w-px bg-border-primary" />
          {/* Language selector */}
          <div className="relative" ref={langMenuRef}>
            <button
              onClick={() => setShowLangMenu((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
            >
              <Globe className="h-3.5 w-3.5" />
              <span>{LANGUAGES.find((l) => l.code === i18n.language)?.name || i18n.language}</span>
            </button>
            {showLangMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[140px] rounded-lg border border-border-primary bg-bg-secondary py-1 shadow-xl">
                {LANGUAGES.filter((l) => l.code === "tr" || l.code === "en").map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => {
                      i18n.changeLanguage(lang.code);
                      setShowLangMenu(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                      i18n.language === lang.code
                        ? "bg-accent/10 text-accent"
                        : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="mx-1 h-4 w-px bg-border-primary" />
          <button
            onClick={toggleAiPanel}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
              isPanelOpen
                ? "bg-accent/10 text-accent"
                : "text-text-muted hover:bg-bg-hover hover:text-text-primary"
            }`}
            title="AI Assistant (⌘I)"
          >
            <Bot className="h-3.5 w-3.5" />
            <span>AI</span>
          </button>
          <div className="mx-1 h-4 w-px bg-border-primary" />
          <button
            onClick={handleDisconnect}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            {tc("disconnect")}
          </button>
        </div>
      </div>

      {showBackup && <BackupDialog onClose={() => setShowBackup(false)} />}
      {showRestore && <RestoreDialog onClose={() => setShowRestore(false)} />}
    </>
  );
}
