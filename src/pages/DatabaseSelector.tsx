import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  Database,
  Loader2,
  ArrowLeft,
  HardDrive,
  User,
} from "lucide-react";
import { useConnectionStore } from "../stores/connectionStore";
import { useTranslation } from "react-i18next";
import type { ConnectionColor } from "../types/connection";

interface DatabaseInfo {
  name: string;
  owner: string;
  encoding: string;
  size: string;
}

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

export default function DatabaseSelector() {
  const { t } = useTranslation("connection");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();
  const {
    connections,
    activeConnectionId,
    disconnectFromDb,
    connectToDb,
    setActiveConnection,
    updateConnection,
    updateLastConnected,
  } = useConnectionStore();

  const [databases, setDatabases] = useState<DatabaseInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectingDb, setConnectingDb] = useState<string | null>(null);

  const activeConnection = connections.find(
    (c) => c.id === activeConnectionId
  );

  useEffect(() => {
    if (!activeConnectionId) {
      navigate("/");
      return;
    }
    loadDatabases();
  }, [activeConnectionId]);

  async function loadDatabases() {
    setIsLoading(true);
    setError(null);
    try {
      const dbs = await invoke<DatabaseInfo[]>("list_databases", {
        connectionId: activeConnectionId,
      });
      setDatabases(dbs);
    } catch (err: any) {
      setError(err?.toString() || t("loadDbError"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSelectDb(dbName: string) {
    if (!activeConnectionId || !activeConnection) return;
    setConnectingDb(dbName);
    setError(null);

    try {
      // Disconnect from current "postgres" connection
      await disconnectFromDb(activeConnectionId);

      // Create updated config with selected database
      const updatedConn = { ...activeConnection, database: dbName };

      // Update stored connection
      await updateConnection(activeConnection.id, { database: dbName });

      // Reconnect with selected database
      await connectToDb(updatedConn);
      setActiveConnection(activeConnection.id);
      await updateLastConnected(activeConnection.id);

      navigate("/database");
    } catch (err: any) {
      setError(err?.toString() || t("connectionError"));
      // Try to reconnect to postgres as fallback
      try {
        const fallbackConn = { ...activeConnection, database: "" };
        await connectToDb(fallbackConn);
        setActiveConnection(activeConnection.id);
      } catch {
        // If fallback fails, go back to connection manager
        navigate("/");
      }
    } finally {
      setConnectingDb(null);
    }
  }

  async function handleBack() {
    if (activeConnectionId) {
      try {
        await disconnectFromDb(activeConnectionId);
      } catch {
        // ignore
      }
    }
    navigate("/");
  }

  if (!activeConnection) return null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-primary bg-bg-secondary px-6 py-4">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {tc("back")}
          </button>
          <div className="h-5 w-px bg-border-primary" />
          <div className="flex items-center gap-2">
            <div
              className={`h-2.5 w-2.5 rounded-full ${colorMap[activeConnection.color]}`}
            />
            <span className="text-sm font-medium text-text-primary">
              {activeConnection.name}
            </span>
          </div>
          <span className="text-xs text-text-muted font-mono">
            {activeConnection.host}:{activeConnection.port}
          </span>
        </div>
      </div>

      {/* Error Toast */}
      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
          </div>
        ) : (
          <div className="mx-auto max-w-3xl">
            <div className="mb-6 text-center">
              <h2 className="text-lg font-semibold text-text-primary">
                {t("selectDatabase")}
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                {t("selectDatabaseDesc")}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {databases.map((db) => (
                <button
                  key={db.name}
                  onClick={() => handleSelectDb(db.name)}
                  disabled={connectingDb !== null}
                  className="group flex items-center gap-3 rounded-xl border border-border-primary bg-bg-secondary p-4 text-left hover:border-accent/40 hover:bg-bg-hover transition-all disabled:opacity-50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                    {connectingDb === db.name ? (
                      <Loader2 className="h-5 w-5 animate-spin text-accent" />
                    ) : (
                      <Database className="h-5 w-5 text-accent" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-text-primary text-sm">
                      {db.name}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-text-muted">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {db.owner}
                      </span>
                      <span className="flex items-center gap-1">
                        <HardDrive className="h-3 w-3" />
                        {db.size}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
