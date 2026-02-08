import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Database, Plus, Search, Loader2 } from "lucide-react";
import { useConnectionStore } from "../stores/connectionStore";
import ConnectionForm from "../components/ConnectionForm";
import ConnectionCard from "../components/ConnectionCard";
import type { ConnectionConfig } from "../types/connection";
import { useTranslation } from "react-i18next";

export default function ConnectionManager() {
  const navigate = useNavigate();
  const {
    connections,
    isLoading,
    loadConnections,
    addConnection,
    updateConnection,
    deleteConnection,
    setActiveConnection,
    updateLastConnected,
    connectToDb,
  } = useConnectionStore();
  const { t } = useTranslation("connection");

  const [showForm, setShowForm] = useState(false);
  const [editingConnection, setEditingConnection] = useState<
    ConnectionConfig | undefined
  >();
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    loadConnections();
  }, []);

  const filteredConnections = connections.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.host.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.database.toLowerCase().includes(searchQuery.toLowerCase())
  );

  function handleSave(conn: ConnectionConfig) {
    if (editingConnection) {
      updateConnection(conn.id, conn);
    } else {
      addConnection(conn);
    }
    setShowForm(false);
    setEditingConnection(undefined);
  }

  function handleEdit(conn: ConnectionConfig) {
    setEditingConnection(conn);
    setShowForm(true);
  }

  function handleDelete(id: string) {
    if (deleteConfirm === id) {
      deleteConnection(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setTimeout(() => setDeleteConfirm(null), 3000);
    }
  }

  async function handleConnect(conn: ConnectionConfig) {
    setConnectingId(conn.id);
    setConnectError(null);
    try {
      await connectToDb(conn);
      setActiveConnection(conn.id);
      await updateLastConnected(conn.id);
      // If database is empty, show database selector
      if (!conn.database.trim()) {
        navigate("/select-database");
      } else {
        navigate("/database");
      }
    } catch (err: any) {
      setConnectError(err?.toString() || t("connectionError"));
      setTimeout(() => setConnectError(null), 5000);
    } finally {
      setConnectingId(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-primary px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10">
            <Database className="h-5 w-5 text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">
              {t("title")}
            </h1>
            <p className="text-xs text-text-muted">
              {t("subtitle")}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            setEditingConnection(undefined);
            setShowForm(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent-hover transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("newConnection")}
        </button>
      </div>

      {/* Error Toast */}
      {connectError && (
        <div className="mx-6 mt-4 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {connectError}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-text-muted" />
          </div>
        ) : connections.length === 0 ? (
          /* Empty State */
          <div className="flex h-full flex-col items-center justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-bg-secondary">
              <Database className="h-10 w-10 text-text-muted" />
            </div>
            <h2 className="mt-4 text-lg font-medium text-text-primary">
              {t("noConnections")}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              {t("noConnectionsDesc")}
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-6 flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-medium text-black hover:bg-accent-hover transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t("addFirst")}
            </button>
          </div>
        ) : (
          <>
            {/* Search */}
            {connections.length > 3 && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  className="w-full rounded-lg border border-border-primary bg-bg-secondary py-2 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
                />
              </div>
            )}

            {/* Connection Grid */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredConnections.map((conn) => (
                <div key={conn.id} className="relative">
                  <ConnectionCard
                    connection={conn}
                    onConnect={handleConnect}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    isConnecting={connectingId === conn.id}
                  />
                  {deleteConfirm === conn.id && (
                    <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-bg-secondary/95 backdrop-blur-sm border border-danger/30">
                      <div className="text-center">
                        <p className="text-sm text-text-primary">
                          {t("common:clickToConfirmDelete")}
                        </p>
                        <button
                          onClick={() => handleDelete(conn.id)}
                          className="mt-2 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white hover:bg-danger/80 transition-colors"
                        >
                          {t("common:confirm")}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {filteredConnections.length === 0 && searchQuery && (
              <div className="mt-12 text-center">
                <p className="text-sm text-text-muted">
                  {t("noSearchResults", { query: searchQuery })}
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <ConnectionForm
          editingConnection={editingConnection}
          onSave={handleSave}
          onCancel={() => {
            setShowForm(false);
            setEditingConnection(undefined);
          }}
        />
      )}
    </div>
  );
}
