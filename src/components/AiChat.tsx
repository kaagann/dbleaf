import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  X,
  Send,
  Loader2,
  Settings,
  Trash2,
  ChevronDown,
  ChevronRight,
  Bot,
  User,
  Wrench,
  TerminalSquare,
  Copy,
} from "lucide-react";
import { useAiStore } from "../stores/aiStore";
import { useConnectionStore } from "../stores/connectionStore";
import { useDatabaseStore } from "../stores/databaseStore";
import { useTabStore } from "../stores/tabStore";
import AiSettings from "./AiSettings";
import type { DisplayMessage, DisplayToolCall } from "../types/ai";

// ── Content parsing ──

interface ContentSegment {
  type: "text" | "code" | "table";
  content: string;
  lang?: string;
  headers?: string[];
  rows?: string[][];
}

function parseMarkdownTable(block: string): { headers: string[]; rows: string[][] } | null {
  const lines = block.trim().split("\n");
  if (lines.length < 2) return null;

  // Check header separator line (e.g. |---|---|---|)
  const sepIndex = lines.findIndex((l) => /^\|[\s\-:|]+\|$/.test(l.trim()));
  if (sepIndex < 1) return null;

  const parseLine = (line: string) =>
    line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

  const headers = parseLine(lines[sepIndex - 1]);
  if (headers.length < 2) return null;

  const rows: string[][] = [];
  for (let i = sepIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || !line.startsWith("|")) break;
    rows.push(parseLine(line));
  }

  if (rows.length === 0) return null;
  return { headers, rows };
}

function splitTextWithTables(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  // Match markdown table blocks: header line + separator + data rows
  const tableRegex = /(?:^|\n)((?:\|[^\n]+\|\s*\n)\|[\s\-:|]+\|\s*\n(?:\|[^\n]+\|\s*(?:\n|$))+)/gm;
  let lastIndex = 0;
  let match;

  while ((match = tableRegex.exec(text)) !== null) {
    const tableStart = match.index + (text[match.index] === "\n" ? 1 : 0);
    if (tableStart > lastIndex) {
      segments.push({ type: "text", content: text.slice(lastIndex, tableStart) });
    }
    const parsed = parseMarkdownTable(match[1]);
    if (parsed) {
      segments.push({ type: "table", content: match[1], headers: parsed.headers, rows: parsed.rows });
    } else {
      segments.push({ type: "text", content: match[1] });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", content: text.slice(lastIndex) });
  }

  return segments;
}

function parseContent(text: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const regex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push(...splitTextWithTables(text.slice(lastIndex, match.index)));
    }
    segments.push({ type: "code", content: match[2].trim(), lang: match[1] || undefined });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    segments.push(...splitTextWithTables(text.slice(lastIndex)));
  }

  return segments;
}

function renderInlineMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/`([^`]+)`/g, '<code class="rounded bg-bg-primary px-1 py-0.5 text-[11px] font-mono">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\n/g, "<br/>");
}

// ── Tool name display ──

const TOOL_LABELS: Record<string, string> = {
  list_databases: "List Databases",
  list_tables: "List Tables",
  describe_table: "Describe Table",
  get_table_relations: "Table Relations",
  execute_readonly_query: "Execute Query",
  get_database_stats: "Database Stats",
  get_table_sample: "Table Sample",
  get_table_indexes: "Table Indexes",
};

// ── Tool Call Block ──

function ToolCallBlock({
  tc,
  messageId,
}: {
  tc: DisplayToolCall;
  messageId: string;
}) {
  const { t } = useTranslation("ai");
  const { toggleToolCallExpanded } = useAiStore();

  let parsedResult: { columns?: string[]; rows?: Record<string, unknown>[] } | null = null;
  if (tc.result) {
    try {
      parsedResult = JSON.parse(tc.result);
    } catch {
      // not JSON, show as text
    }
  }

  const isQueryResult =
    parsedResult && Array.isArray(parsedResult.columns) && Array.isArray(parsedResult.rows);

  return (
    <div className="my-1.5 rounded border border-border-primary bg-bg-primary overflow-hidden">
      <button
        onClick={() => toggleToolCallExpanded(messageId, tc.id)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-[10px] text-text-muted hover:bg-bg-hover transition-colors"
      >
        {tc.isExpanded ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <Wrench className="h-3 w-3 shrink-0 text-info" />
        <span className="font-medium text-text-secondary">
          {TOOL_LABELS[tc.name] || tc.name}
        </span>
        {tc.result && (
          <span className="ml-auto text-success">
            {t("panel.toolResult")}
          </span>
        )}
        {!tc.result && (
          <Loader2 className="ml-auto h-3 w-3 animate-spin" />
        )}
      </button>

      {tc.isExpanded && (
        <div className="border-t border-border-primary px-2 py-1.5">
          {/* Arguments */}
          {tc.arguments && (
            <pre className="mb-1 text-[10px] font-mono text-text-muted whitespace-pre-wrap break-all">
              {tc.arguments}
            </pre>
          )}

          {/* Result */}
          {tc.result && (
            <div className="mt-1">
              {isQueryResult && parsedResult!.rows!.length > 0 ? (
                <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="border-b border-border-primary">
                        {parsedResult!.columns!.map((col) => (
                          <th
                            key={col}
                            className="px-1.5 py-0.5 text-left font-medium text-text-secondary whitespace-nowrap"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {parsedResult!.rows!.slice(0, 10).map((row, i) => (
                        <tr
                          key={i}
                          className="border-b border-border-primary/50"
                        >
                          {parsedResult!.columns!.map((col) => (
                            <td
                              key={col}
                              className="px-1.5 py-0.5 font-mono text-text-primary whitespace-nowrap max-w-[150px] truncate"
                            >
                              {row[col] === null
                                ? "NULL"
                                : String(row[col])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedResult!.rows!.length > 10 && (
                    <div className="px-1.5 py-0.5 text-[10px] text-text-muted">
                      +{parsedResult!.rows!.length - 10} more rows...
                    </div>
                  )}
                </div>
              ) : (
                <pre className="text-[10px] font-mono text-text-secondary whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto">
                  {typeof tc.result === "string" && tc.result.length > 500
                    ? tc.result.slice(0, 500) + "..."
                    : tc.result}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Code Block with "Open in Editor" button ──

function CodeBlock({ code, lang }: { code: string; lang?: string }) {
  const { openQueryTab } = useTabStore();
  const isSql = lang === "sql" || lang === "pgsql" || lang === "postgresql";

  return (
    <div className="group/code relative my-1.5 rounded bg-bg-primary overflow-hidden">
      {isSql && (
        <button
          onClick={() => openQueryTab(code)}
          className="absolute top-1 right-1 z-10 flex items-center gap-1 rounded bg-bg-tertiary/90 px-1.5 py-0.5 text-[9px] text-text-muted opacity-0 group-hover/code:opacity-100 hover:text-accent transition-all"
        >
          <TerminalSquare className="h-2.5 w-2.5" />
          <span>Editörde Aç</span>
        </button>
      )}
      <pre className="p-2 text-[11px] font-mono overflow-x-auto">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// ── Markdown Table ──

function MarkdownTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  const { t } = useTranslation("ai");

  function handleCopy() {
    const tsv = [headers.join("\t"), ...rows.map((r) => r.join("\t"))].join("\n");
    navigator.clipboard.writeText(tsv);
  }

  return (
    <div className="group/table relative my-1.5 rounded border border-border-primary bg-bg-primary overflow-hidden">
      <button
        onClick={handleCopy}
        className="absolute top-1 right-1 z-10 flex items-center gap-1 rounded bg-bg-tertiary/90 px-1.5 py-0.5 text-[9px] text-text-muted opacity-0 group-hover/table:opacity-100 hover:text-accent transition-all"
        title={t("panel.copyQuery")}
      >
        <Copy className="h-2.5 w-2.5" />
      </button>
      <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-border-primary">
              {headers.map((h, i) => (
                <th
                  key={i}
                  className="px-1.5 py-0.5 text-left font-medium text-text-secondary whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border-primary/50">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className="px-1.5 py-0.5 font-mono text-text-primary whitespace-nowrap max-w-[200px] truncate"
                  >
                    {cell || "NULL"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 0 && (
          <div className="px-1.5 py-0.5 text-[10px] text-text-muted border-t border-border-primary">
            {t("panel.rows", { count: rows.length })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Message Bubble ──

function MessageBubble({
  message,
}: {
  message: DisplayMessage;
}) {
  const isUser = message.role === "user";
  const segments = message.content ? parseContent(message.content) : [];

  return (
    <div className={`flex gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      <div
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
          isUser ? "bg-accent/20" : "bg-info/20"
        }`}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5 text-accent" />
        ) : (
          <Bot className="h-3.5 w-3.5 text-info" />
        )}
      </div>

      {/* Content */}
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${
          isUser
            ? "bg-accent/10 text-text-primary"
            : "bg-bg-tertiary text-text-primary"
        }`}
      >
        {message.isStreaming && !message.content && (
          <div className="flex items-center gap-1.5 text-text-muted">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-[11px]">...</span>
          </div>
        )}

        {segments.length > 0 && (
          <div className="leading-relaxed [&_code]:text-accent">
            {segments.map((seg, i) =>
              seg.type === "code" ? (
                <CodeBlock key={i} code={seg.content} lang={seg.lang} />
              ) : seg.type === "table" && seg.headers && seg.rows ? (
                <MarkdownTable key={i} headers={seg.headers} rows={seg.rows} />
              ) : (
                <span
                  key={i}
                  dangerouslySetInnerHTML={{
                    __html: renderInlineMarkdown(seg.content),
                  }}
                />
              )
            )}
          </div>
        )}

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-1">
            {message.toolCalls.map((tc) => (
              <ToolCallBlock
                key={tc.id}
                tc={tc}
                messageId={message.id}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ──

export default function AiChat() {
  const { t } = useTranslation("ai");
  const {
    messages,
    isStreaming,
    apiKey,
    isPanelOpen,
    closePanel,
    sendMessage,
    clearChat,
    loadSettings,
    settingsLoaded,
  } = useAiStore();
  const { activeConnectionId, connections } = useConnectionStore();
  const { schemas, tablesBySchema } = useDatabaseStore();

  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!settingsLoaded) loadSettings();
  }, [settingsLoaded, loadSettings]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isPanelOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isPanelOpen]);

  function buildDbContext(): string {
    const conn = connections.find((c) => c.id === activeConnectionId);
    if (!conn) return "";

    let context = `Connected to: ${conn.host}:${conn.port}/${conn.database}\n`;
    context += `Schemas: ${schemas.map((s) => s.name).join(", ")}\n`;

    for (const [schema, tables] of Object.entries(tablesBySchema)) {
      context += `\n${schema}:\n`;
      for (const tbl of tables) {
        context += `  - ${tbl.name} (${tbl.table_type}, ~${tbl.estimated_rows} rows)\n`;
      }
    }
    return context;
  }

  async function handleSend() {
    if (!input.trim() || isStreaming || !activeConnectionId) return;
    const text = input.trim();
    setInput("");
    try {
      await sendMessage(text, activeConnectionId, buildDbContext());
    } catch {
      // handled in store
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!isPanelOpen) return null;

  return (
    <>
      <div className="flex h-full w-[400px] shrink-0 flex-col border-l border-border-primary bg-bg-secondary">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-primary px-3 py-2">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-info" />
            <span className="text-xs font-semibold text-text-primary">
              {t("panel.title")}
            </span>
          </div>
          <div className="flex items-center gap-0.5">
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
                title={t("panel.newChat")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
              title={t("settings.title")}
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={closePanel}
              className="rounded p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <Bot className="mx-auto h-10 w-10 text-text-muted/30" />
              <p className="mt-2 text-sm font-medium text-text-secondary">
                {t("panel.emptyTitle")}
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {t("panel.emptyDesc")}
              </p>
            </div>
          ) : (
            // Message list
            <>
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* No API key banner */}
        {!apiKey && settingsLoaded && (
          <div className="flex items-center justify-between border-t border-border-primary bg-warning/5 px-3 py-2">
            <span className="text-xs text-warning">
              {t("panel.noApiKey")}
            </span>
            <button
              onClick={() => setShowSettings(true)}
              className="text-xs font-medium text-accent hover:text-accent-hover transition-colors"
            >
              {t("panel.setApiKey")}
            </button>
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-border-primary p-2">
          <div className="flex items-end gap-1.5">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("panel.placeholder")}
              disabled={!apiKey || !activeConnectionId}
              rows={1}
              className="flex-1 resize-none rounded-lg border border-border-primary bg-bg-primary px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none disabled:opacity-50 max-h-[120px]"
              style={{ minHeight: "36px" }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = "36px";
                target.style.height =
                  Math.min(target.scrollHeight, 120) + "px";
              }}
            />
            <button
              onClick={handleSend}
              disabled={
                !input.trim() ||
                isStreaming ||
                !apiKey ||
                !activeConnectionId
              }
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-bg-primary hover:bg-accent-hover disabled:opacity-30 transition-colors"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      {showSettings && (
        <AiSettings onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}
