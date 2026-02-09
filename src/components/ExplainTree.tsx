import { useState } from "react";
import { X, Clock, Rows3, Gauge } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ExplainPlanNode, ExplainResult } from "../types/explain";

function findNodeByPath(
  root: ExplainPlanNode,
  path: string
): ExplainPlanNode | null {
  const parts = path.split("-").map(Number);
  let current = root;
  for (let i = 1; i < parts.length; i++) {
    if (!current.children[parts[i]]) return null;
    current = current.children[parts[i]];
  }
  return current;
}

function getBarColor(ratio: number): string {
  if (ratio < 0.33) return "bg-accent/60";
  if (ratio < 0.66) return "bg-warning/60";
  return "bg-danger/60";
}

function getBorderColor(ratio: number): string {
  if (ratio < 0.33) return "border-accent/40";
  if (ratio < 0.66) return "border-warning/40";
  return "border-danger/40";
}

interface PlanNodeCardProps {
  node: ExplainPlanNode;
  totalCost: number;
  maxActualTime: number;
  depth: number;
  selectedNodeId: string | null;
  onSelect: (nodeId: string) => void;
  path: string;
}

function PlanNodeCard({
  node,
  totalCost,
  maxActualTime,
  depth,
  selectedNodeId,
  onSelect,
  path,
}: PlanNodeCardProps) {
  const { t } = useTranslation("database");
  const isSelected = selectedNodeId === path;

  const costRatio = totalCost > 0 ? node.totalCost / totalCost : 0;
  const timeRatio =
    maxActualTime > 0 && node.actualTotalTime != null
      ? node.actualTotalTime / maxActualTime
      : costRatio;

  const barColor = getBarColor(timeRatio);
  const leftBorderColor = getBorderColor(timeRatio);

  return (
    <div className={depth > 0 ? "ml-6 relative" : ""}>
      {/* Connector line from parent */}
      {depth > 0 && (
        <div className="absolute left-[-12px] top-0 h-5 w-3 border-l-2 border-b-2 border-border-secondary rounded-bl" />
      )}

      {/* Node card */}
      <div
        onClick={() => onSelect(path)}
        className={`my-1 rounded border-l-[3px] border border-border-primary p-2 cursor-pointer hover:border-accent/30 transition-colors ${
          isSelected
            ? "border-l-accent bg-accent/5"
            : `${leftBorderColor} bg-bg-secondary`
        }`}
      >
        {/* Node type + relation */}
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-text-primary">
            {node.nodeType}
          </span>
          {node.relationName && (
            <span className="text-accent font-mono text-[11px]">
              {node.relationName}
            </span>
          )}
          {node.joinType && (
            <span className="text-info text-[10px] bg-info/10 px-1 rounded">
              {node.joinType}
            </span>
          )}
          {node.indexName && (
            <span className="text-warning text-[10px] bg-warning/10 px-1 rounded">
              {node.indexName}
            </span>
          )}
        </div>

        {/* Cost bar */}
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-bg-tertiary overflow-hidden">
          <div
            className={`h-full rounded-full ${barColor} transition-all`}
            style={{ width: `${Math.max(costRatio * 100, 2)}%` }}
          />
        </div>

        {/* Stats row */}
        <div className="mt-1 flex items-center gap-3 text-[10px] text-text-muted">
          <span>
            {t("explain.cost")}: {node.totalCost.toFixed(2)}
          </span>
          {node.actualTotalTime != null && (
            <span>
              {t("explain.time")}: {node.actualTotalTime.toFixed(3)} ms
            </span>
          )}
          <span>
            {t("explain.rows")}:{" "}
            {node.actualRows != null
              ? `${node.actualRows} / ${node.planRows}`
              : node.planRows}
          </span>
          {node.actualLoops != null && node.actualLoops > 1 && (
            <span>×{node.actualLoops}</span>
          )}
        </div>

        {/* Filter/condition hint */}
        {node.filter && (
          <div className="mt-1 text-[10px] text-text-muted truncate">
            Filter: <span className="font-mono text-text-secondary">{node.filter}</span>
          </div>
        )}
      </div>

      {/* Children */}
      {node.children.length > 0 && (
        <div className="relative">
          {node.children.length > 1 && (
            <div className="absolute left-[12px] top-0 bottom-4 border-l-2 border-border-secondary" />
          )}
          {node.children.map((child, i) => (
            <PlanNodeCard
              key={`${path}-${i}`}
              node={child}
              totalCost={totalCost}
              maxActualTime={maxActualTime}
              depth={depth + 1}
              selectedNodeId={selectedNodeId}
              onSelect={onSelect}
              path={`${path}-${i}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function NodeDetailPanel({
  node,
  onClose,
}: {
  node: ExplainPlanNode;
  onClose: () => void;
}) {
  const { t } = useTranslation("database");

  const rows: [string, string | number | null][] = [
    [t("explain.detail.nodeType"), node.nodeType],
    [t("explain.detail.relation"), node.relationName],
    [t("explain.detail.schema"), node.schema],
    [t("explain.detail.alias"), node.alias],
    [t("explain.detail.joinType"), node.joinType],
    [t("explain.detail.indexName"), node.indexName],
    [t("explain.detail.startupCost"), node.startupCost.toFixed(2)],
    [t("explain.detail.totalCost"), node.totalCost.toFixed(2)],
    [t("explain.detail.planRows"), node.planRows],
    [
      t("explain.detail.actualRows"),
      node.actualRows != null ? node.actualRows : null,
    ],
    [
      t("explain.detail.actualTime"),
      node.actualTotalTime != null
        ? `${node.actualTotalTime.toFixed(3)} ms`
        : null,
    ],
    [t("explain.detail.actualLoops"), node.actualLoops],
    [t("explain.detail.filter"), node.filter],
    [t("explain.detail.indexCond"), node.indexCond],
    [t("explain.detail.hashCond"), node.hashCond],
    [
      t("explain.detail.rowsRemovedByFilter"),
      node.rowsRemovedByFilter,
    ],
    [t("explain.detail.sharedHitBlocks"), node.sharedHitBlocks],
    [t("explain.detail.sharedReadBlocks"), node.sharedReadBlocks],
  ];

  const filteredRows = rows.filter(
    ([, val]) => val != null && val !== ""
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-primary">
        <h3 className="text-xs font-semibold text-text-primary truncate">
          {node.nodeType}
          {node.relationName && (
            <span className="text-accent ml-1.5 font-mono font-normal">
              {node.relationName}
            </span>
          )}
        </h3>
        <button
          onClick={onClose}
          className="text-text-muted hover:text-text-primary p-0.5 rounded hover:bg-bg-hover transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 space-y-1">
        {filteredRows.map(([label, val]) => (
          <div key={label} className="flex justify-between gap-2 text-[11px]">
            <span className="text-text-muted shrink-0">{label}</span>
            <span className="text-text-primary font-mono text-right truncate">
              {String(val)}
            </span>
          </div>
        ))}

        {/* Output columns */}
        {node.output && node.output.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border-primary">
            <span className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
              Output
            </span>
            <div className="mt-1 text-[10px] font-mono text-text-secondary space-y-0.5">
              {node.output.map((col, i) => (
                <div key={i} className="truncate">
                  {col}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sort key */}
        {node.sortKey && node.sortKey.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border-primary">
            <span className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
              Sort Key
            </span>
            <div className="mt-1 text-[10px] font-mono text-text-secondary">
              {node.sortKey.join(", ")}
            </div>
          </div>
        )}

        {/* Extra fields */}
        {Object.keys(node.extra).length > 0 && (
          <div className="mt-2 pt-2 border-t border-border-primary">
            <span className="text-[10px] text-text-muted font-semibold uppercase tracking-wider">
              {t("explain.detail.extraFields")}
            </span>
            <div className="mt-1 space-y-1">
              {Object.entries(node.extra).map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between gap-2 text-[10px]"
                >
                  <span className="text-text-muted shrink-0">{k}</span>
                  <span className="text-text-primary font-mono text-right truncate max-w-[140px]">
                    {typeof v === "string" ? v : JSON.stringify(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  result: ExplainResult;
}

export default function ExplainTree({ result }: Props) {
  const { t } = useTranslation("database");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const selectedNode = selectedPath
    ? findNodeByPath(result.plan, selectedPath)
    : null;

  return (
    <div className="flex h-full">
      {/* Tree panel */}
      <div className="flex-1 overflow-auto p-4 flex flex-col">
        {/* Summary bar */}
        <div className="mb-3 flex items-center gap-4 rounded bg-bg-secondary border border-border-primary px-3 py-2 text-xs text-text-muted shrink-0">
          {result.planningTime != null && (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>
                {t("explain.planningTime")}: {result.planningTime.toFixed(3)} ms
              </span>
            </div>
          )}
          {result.executionTime != null && (
            <div className="flex items-center gap-1">
              <Rows3 className="h-3 w-3" />
              <span>
                {t("explain.executionTime")}:{" "}
                {result.executionTime.toFixed(3)} ms
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Gauge className="h-3 w-3" />
            <span>
              {t("explain.totalCost")}: {result.totalCost.toFixed(2)}
            </span>
          </div>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-auto">
          <PlanNodeCard
            node={result.plan}
            totalCost={result.totalCost}
            maxActualTime={result.maxActualTime}
            depth={0}
            selectedNodeId={selectedPath}
            onSelect={setSelectedPath}
            path="0"
          />
        </div>
      </div>

      {/* Detail panel */}
      {selectedNode && (
        <div className="w-72 shrink-0 border-l border-border-primary bg-bg-secondary overflow-hidden">
          <NodeDetailPanel
            node={selectedNode}
            onClose={() => setSelectedPath(null)}
          />
        </div>
      )}
    </div>
  );
}
