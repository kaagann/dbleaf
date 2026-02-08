import { useState, useEffect } from "react";
import {
  X,
  Link,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
} from "lucide-react";
import { useConnectionStore } from "../stores/connectionStore";
import type {
  ConnectionConfig,
  ConnectionColor,
} from "../types/connection";
import { parseConnectionString, buildConnectionString } from "../types/connection";
import { useTranslation } from "react-i18next";

const CONNECTION_COLORS: ConnectionColor[] = [
  "blue", "green", "purple", "orange", "red", "yellow", "pink", "gray",
];

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
  editingConnection?: ConnectionConfig;
  onSave: (conn: ConnectionConfig) => void;
  onCancel: () => void;
}

export default function ConnectionForm({
  editingConnection,
  onSave,
  onCancel,
}: Props) {
  const { testConnection } = useConnectionStore();
  const { t } = useTranslation("connection");
  const [mode, setMode] = useState<"form" | "string">("form");
  const [connString, setConnString] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const [name, setName] = useState("");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState("5432");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [database, setDatabase] = useState("");
  const [sslMode, setSslMode] = useState(false);
  const [color, setColor] = useState<ConnectionColor>("blue");

  useEffect(() => {
    if (editingConnection) {
      setName(editingConnection.name);
      setHost(editingConnection.host);
      setPort(String(editingConnection.port));
      setUsername(editingConnection.username);
      setPassword(editingConnection.password);
      setDatabase(editingConnection.database);
      setSslMode(editingConnection.sslMode);
      setColor(editingConnection.color);
      setConnString(buildConnectionString(editingConnection));
    }
  }, [editingConnection]);

  function handleConnStringChange(value: string) {
    setConnString(value);
    const parsed = parseConnectionString(value);
    if (parsed.host) setHost(parsed.host);
    if (parsed.port) setPort(String(parsed.port));
    if (parsed.username !== undefined) setUsername(parsed.username);
    if (parsed.password !== undefined) setPassword(parsed.password);
    if (parsed.database !== undefined) setDatabase(parsed.database);
    if (parsed.sslMode !== undefined) setSslMode(parsed.sslMode);
  }

  function handleSave() {
    const conn: ConnectionConfig = {
      id: editingConnection?.id || crypto.randomUUID(),
      name: name || `${host}:${port}/${database}`,
      host,
      port: parseInt(port) || 5432,
      username,
      password,
      database,
      sslMode,
      color,
      createdAt: editingConnection?.createdAt || new Date().toISOString(),
      lastConnectedAt: editingConnection?.lastConnectedAt,
    };
    onSave(conn);
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const conn: ConnectionConfig = {
        id: "test",
        name: "test",
        host,
        port: parseInt(port) || 5432,
        username,
        password,
        database,
        sslMode,
        color,
        createdAt: new Date().toISOString(),
      };
      const version = await testConnection(conn);
      setTestResult({ ok: true, message: version });
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.toString() || t("connectionError") });
    } finally {
      setTesting(false);
    }
  }

  const isValid = mode === "string"
    ? (connString.trim().length > 0 && host && username)
    : (host && username);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-xl border border-border-primary bg-bg-secondary shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-primary px-6 py-4">
          <h2 className="text-lg font-semibold text-text-primary">
            {editingConnection ? t("editConnection") : t("newConnection")}
          </h2>
          <button
            onClick={onCancel}
            className="rounded-lg p-1.5 text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="flex gap-1 border-b border-border-primary px-6 py-2">
          <button
            onClick={() => setMode("form")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              mode === "form"
                ? "bg-bg-active text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <FileText className="h-3.5 w-3.5" />
            {t("form.formMode")}
          </button>
          <button
            onClick={() => setMode("string")}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              mode === "string"
                ? "bg-bg-active text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <Link className="h-3.5 w-3.5" />
            {t("form.stringMode")}
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {mode === "string" ? (
            <>
              {/* Connection String */}
              <div>
                <label className="mb-1.5 block text-sm text-text-secondary">
                  {t("form.connectionString")}
                </label>
                <textarea
                  value={connString}
                  onChange={(e) => handleConnStringChange(e.target.value)}
                  placeholder={t("form.connectionStringPlaceholder")}
                  className="w-full rounded-lg border border-border-primary bg-bg-primary px-3 py-2.5 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none resize-none h-20"
                />
              </div>

              {/* Parse edilmiş bilgi özeti */}
              {host && host !== "localhost" && (
                <div className="rounded-lg border border-border-primary bg-bg-primary p-3 text-xs font-mono text-text-secondary space-y-1">
                  <div className="flex gap-2"><span className="text-text-muted w-16">{t("parsedInfo.host")}</span> {host}:{port}</div>
                  <div className="flex gap-2"><span className="text-text-muted w-16">{t("parsedInfo.user")}</span> {username}</div>
                  <div className="flex gap-2"><span className="text-text-muted w-16">{t("parsedInfo.db")}</span> {database || t("parsedInfo.serverDiscovery")}</div>
                  <div className="flex gap-2"><span className="text-text-muted w-16">{t("parsedInfo.ssl")}</span> {sslMode ? t("parsedInfo.sslOn") : t("parsedInfo.sslOff")}</div>
                </div>
              )}

              {/* Bağlantı Adı + Renk (string modunda da göster) */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm text-text-secondary">
                    {t("form.name")}
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("form.namePlaceholder")}
                    className="w-full rounded-lg border border-border-primary bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-text-secondary">
                    {t("form.color")}
                  </label>
                  <div className="flex gap-1.5 rounded-lg border border-border-primary bg-bg-primary px-2 py-2">
                    {CONNECTION_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        title={t(`colors.${c}`)}
                        className={`h-6 w-6 rounded-full ${colorMap[c]} transition-all ${
                          color === c
                            ? "ring-2 ring-white ring-offset-2 ring-offset-bg-primary scale-110"
                            : "opacity-60 hover:opacity-100"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Bağlantı Adı */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm text-text-secondary">
                    {t("form.name")}
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t("form.namePlaceholder")}
                    className="w-full rounded-lg border border-border-primary bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm text-text-secondary">
                    {t("form.color")}
                  </label>
                  <div className="flex gap-1.5 rounded-lg border border-border-primary bg-bg-primary px-2 py-2">
                    {CONNECTION_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        title={t(`colors.${c}`)}
                        className={`h-6 w-6 rounded-full ${colorMap[c]} transition-all ${
                          color === c
                            ? "ring-2 ring-white ring-offset-2 ring-offset-bg-primary scale-110"
                            : "opacity-60 hover:opacity-100"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Host + Port */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm text-text-secondary">
                    {t("form.host")}
                  </label>
                  <input
                    value={host}
                    onChange={(e) => setHost(e.target.value)}
                    placeholder={t("form.hostPlaceholder")}
                    className="w-full rounded-lg border border-border-primary bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
                  />
                </div>
                <div className="w-24">
                  <label className="mb-1.5 block text-sm text-text-secondary">
                    {t("form.port")}
                  </label>
                  <input
                    value={port}
                    onChange={(e) => setPort(e.target.value)}
                    placeholder="5432"
                    className="w-full rounded-lg border border-border-primary bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
                  />
                </div>
              </div>

              {/* Username + Password */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm text-text-secondary">
                    {t("form.username")}
                  </label>
                  <input
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder={t("form.usernamePlaceholder")}
                    className="w-full rounded-lg border border-border-primary bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm text-text-secondary">
                    {t("form.password")}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t("form.passwordPlaceholder")}
                      className="w-full rounded-lg border border-border-primary bg-bg-primary px-3 py-2 pr-9 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Database */}
              <div>
                <label className="mb-1.5 block text-sm text-text-secondary">
                  {t("form.database")}
                </label>
                <input
                  value={database}
                  onChange={(e) => setDatabase(e.target.value)}
                  placeholder={t("form.databasePlaceholder")}
                  className="w-full rounded-lg border border-border-primary bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none"
                />
              </div>

              {/* SSL Toggle */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSslMode(!sslMode)}
                  className={`relative h-5 w-9 rounded-full transition-colors ${
                    sslMode ? "bg-accent" : "bg-bg-active"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                      sslMode ? "translate-x-4" : ""
                    }`}
                  />
                </button>
                <span className="text-sm text-text-secondary">{t("form.ssl")}</span>
              </div>
            </>
          )}
        </div>

        {/* Test Result */}
        {testResult && (
          <div className={`mx-6 rounded-lg border px-4 py-3 text-xs ${
            testResult.ok
              ? "border-success/30 bg-success/10 text-success"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}>
            <div className="flex items-center gap-2">
              {testResult.ok ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              <span className="font-medium">{testResult.ok ? t("testSuccess") : t("testFail")}</span>
            </div>
            <p className="mt-1 text-text-secondary truncate">{testResult.message}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between border-t border-border-primary px-6 py-4">
          <button
            onClick={handleTest}
            disabled={!isValid || testing}
            className="flex items-center gap-2 rounded-lg border border-border-primary px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {testing ? t("testing") : t("testConnection")}
          </button>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="rounded-lg border border-border-primary px-4 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
            >
              {t("common:cancel")}
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-black hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {editingConnection ? t("common:update") : t("common:save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
