import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { sql, PostgreSQL } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";
import {
  bracketMatching,
  indentOnInput,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { invoke } from "@tauri-apps/api/core";
import {
  Play,
  Loader2,
  Clock,
  Rows3,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useConnectionStore } from "../stores/connectionStore";
import { useDatabaseStore } from "../stores/databaseStore";

interface QueryColumn {
  name: string;
  data_type: string;
}

interface ExecuteQueryResult {
  columns: QueryColumn[];
  rows: any[][];
  row_count: number;
  execution_time_ms: number;
  is_select: boolean;
}

interface Props {
  initialSql?: string;
  tabId?: string;
}

export default function SqlEditor({ initialSql = "", tabId: _tabId }: Props) {
  const { t } = useTranslation("database");
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const executeRef = useRef<() => void>(() => {});
  const sqlCompartment = useRef(new Compartment());
  const { activeConnectionId } = useConnectionStore();
  const { completions } = useDatabaseStore();
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ExecuteQueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Build CodeMirror schema object from completions
  const cmSchema = useMemo(() => {
    if (!completions) return undefined;
    const schema: Record<string, string[]> = {};
    for (const table of completions.tables) {
      // Add as schema.table
      schema[`${table.schema}.${table.name}`] = table.columns;
      // Also add just table name for convenience
      if (!schema[table.name]) {
        schema[table.name] = table.columns;
      }
    }
    return schema;
  }, [completions]);

  const executeQuery = useCallback(async () => {
    if (!activeConnectionId || !viewRef.current) return;
    const sqlText = viewRef.current.state.doc.toString().trim();
    if (!sqlText) return;

    setIsExecuting(true);
    setError(null);
    setResult(null);

    try {
      const res = await invoke<ExecuteQueryResult>("execute_query", {
        connectionId: activeConnectionId,
        sql: sqlText,
      });
      setResult(res);
    } catch (err: any) {
      setError(err?.toString() || t("sql.executeError"));
    } finally {
      setIsExecuting(false);
    }
  }, [activeConnectionId]);

  // Keep ref up to date so the keymap always calls the latest function
  executeRef.current = executeQuery;

  useEffect(() => {
    if (!editorRef.current) return;

    const execKeymap = keymap.of([
      {
        key: "Mod-Enter",
        run: () => {
          executeRef.current();
          return true;
        },
      },
    ]);

    const theme = EditorView.theme({
      "&": {
        height: "100%",
        fontSize: "13px",
        backgroundColor: "#101512",
      },
      ".cm-content": {
        fontFamily: "'JetBrains Mono', monospace",
        caretColor: "#76ff9f",
        padding: "8px 0",
      },
      ".cm-gutters": {
        backgroundColor: "#212428",
        color: "#555a63",
        border: "none",
        borderRight: "1px solid #2a2e33",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "#2a2e33",
      },
      ".cm-activeLine": {
        backgroundColor: "#21242880",
      },
      ".cm-cursor": {
        borderLeftColor: "#76ff9f",
      },
      ".cm-selectionBackground": {
        backgroundColor: "#76ff9f30 !important",
      },
      "&.cm-focused .cm-selectionBackground": {
        backgroundColor: "#76ff9f30 !important",
      },
      ".cm-line": {
        padding: "0 8px",
      },
      ".cm-tooltip": {
        backgroundColor: "#212428",
        border: "1px solid #2a2e33",
      },
      ".cm-tooltip-autocomplete ul li": {
        color: "#e8e8e8",
      },
      ".cm-tooltip-autocomplete ul li[aria-selected]": {
        backgroundColor: "#76ff9f30",
        color: "#e8e8e8",
      },
    });

    const state = EditorState.create({
      doc: initialSql,
      extensions: [
        execKeymap,
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...closeBracketsKeymap]),
        sqlCompartment.current.of(
          sql({
            dialect: PostgreSQL,
            schema: cmSchema,
            upperCaseKeywords: true,
          })
        ),
        oneDark,
        theme,
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        indentOnInput(),
        placeholder(t("sql.placeholder")),
        EditorView.lineWrapping,
        EditorState.tabSize.of(2),
      ],
    });

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, []);

  // Update SQL extension when completions change
  useEffect(() => {
    if (!viewRef.current) return;
    viewRef.current.dispatch({
      effects: sqlCompartment.current.reconfigure(
        sql({
          dialect: PostgreSQL,
          schema: cmSchema,
          upperCaseKeywords: true,
        })
      ),
    });
  }, [cmSchema]);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border-primary bg-bg-secondary px-3 py-1.5">
        <button
          onClick={executeQuery}
          disabled={isExecuting}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1 text-xs font-medium text-black hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {isExecuting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {t("sql.execute")}
        </button>
        <span className="text-[10px] text-text-muted">⌘+Enter</span>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        className="min-h-[120px] flex-1 overflow-hidden border-b border-border-primary"
      />

      {/* Results */}
      <div className="flex max-h-[60%] min-h-[100px] flex-1 flex-col overflow-hidden">
        {isExecuting && (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-text-muted" />
          </div>
        )}

        {error && (
          <div className="flex-1 overflow-auto p-4">
            <div className="flex items-start gap-2 text-danger">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                {error}
              </pre>
            </div>
          </div>
        )}

        {result && !result.is_select && (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm">
                {t("common:rowsAffected", { count: result.row_count })}
              </span>
              <span className="text-xs text-text-muted">
                ({result.execution_time_ms} ms)
              </span>
            </div>
          </div>
        )}

        {result && result.is_select && (
          <>
            {/* Result table */}
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-bg-secondary">
                  <tr>
                    <th className="w-12 border-b border-r border-border-primary px-2 py-1.5 text-center text-xs font-medium text-text-muted">
                      #
                    </th>
                    {result.columns.map((col) => (
                      <th
                        key={col.name}
                        className="border-b border-r border-border-primary px-3 py-1.5 text-left text-xs font-medium text-text-secondary whitespace-nowrap"
                      >
                        <div className="flex items-center gap-1">
                          <span>{col.name}</span>
                          <span className="text-[10px] text-text-muted font-normal">
                            {col.data_type}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row, rowIdx) => (
                    <tr
                      key={rowIdx}
                      className="hover:bg-bg-hover/50 transition-colors"
                    >
                      <td className="border-b border-r border-border-primary px-2 py-1 text-center text-xs text-text-muted">
                        {rowIdx + 1}
                      </td>
                      {row.map((val, colIdx) => (
                        <td
                          key={colIdx}
                          className="border-b border-r border-border-primary px-3 py-1 font-mono text-xs text-text-primary max-w-xs truncate"
                        >
                          {val === null || val === undefined ? (
                            <span className="text-text-muted italic">NULL</span>
                          ) : typeof val === "object" ? (
                            <span className="text-accent">
                              {JSON.stringify(val)}
                            </span>
                          ) : typeof val === "boolean" ? (
                            <span
                              className={
                                val ? "text-success" : "text-danger"
                              }
                            >
                              {val.toString()}
                            </span>
                          ) : (
                            String(val)
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Result footer */}
            <div className="flex shrink-0 items-center gap-4 border-t border-border-primary bg-bg-secondary px-4 py-1.5 text-xs text-text-muted">
              <div className="flex items-center gap-1">
                <Rows3 className="h-3 w-3" />
                <span>{t("common:rows", { count: result.row_count })}</span>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{result.execution_time_ms} ms</span>
              </div>
            </div>
          </>
        )}

        {!isExecuting && !result && !error && (
          <div className="flex flex-1 items-center justify-center text-text-muted">
            <p className="text-xs">
              {t("sql.resultPlaceholder")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
