import { useEffect, useState, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  BackgroundVariant,
  type Node,
  type Edge,
  type NodeProps,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";
import { Loader2, Key, ArrowRight } from "lucide-react";
import { useConnectionStore } from "../stores/connectionStore";
import { useTranslation } from "react-i18next";

// ── Backend types ──

interface ErColumn {
  name: string;
  data_type: string;
  is_primary_key: boolean;
  is_nullable: boolean;
}

interface ErTable {
  name: string;
  columns: ErColumn[];
}

interface ErRelationship {
  name: string;
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
}

interface ErDiagramData {
  tables: ErTable[];
  relationships: ErRelationship[];
}

// ── Constants ──

const TABLE_WIDTH = 230;
const HEADER_HEIGHT = 32;
const ROW_HEIGHT = 24;

function getTableHeight(columnCount: number): number {
  return HEADER_HEIGHT + columnCount * ROW_HEIGHT + 8;
}

// ── ELK layout ──

const elk = new ELK();

async function layoutWithElk(
  nodes: Node<TableNodeData>[],
  edges: Edge[],
): Promise<{ nodes: Node<TableNodeData>[]; edges: Edge[] }> {
  const elkGraph = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      "elk.padding": "[top=40,left=40,bottom=40,right=40]",
    },
    children: nodes.map((node) => ({
      id: node.id,
      width: node.measured?.width ?? TABLE_WIDTH,
      height: node.measured?.height ?? getTableHeight(node.data.columns.length),
    })),
    edges: edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  };

  const layouted = await elk.layout(elkGraph);

  const layoutedNodes = nodes.map((node) => {
    const elkNode = layouted.children?.find((n) => n.id === node.id);
    return {
      ...node,
      position: {
        x: elkNode?.x ?? 0,
        y: elkNode?.y ?? 0,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

// ── Custom table node ──

interface TableNodeData {
  label: string;
  columns: ErColumn[];
  fkColumns: Set<string>;
  [key: string]: unknown;
}

const TableNode = memo(({ data }: NodeProps<Node<TableNodeData>>) => {
  return (
    <div
      className="rounded-lg border border-border-primary bg-bg-secondary shadow-lg overflow-hidden"
      style={{ width: TABLE_WIDTH }}
    >
      {/* Handles for edges */}
      <Handle type="target" position={Position.Left} className="!bg-info !w-2 !h-2 !border-info/50" />
      <Handle type="source" position={Position.Right} className="!bg-info !w-2 !h-2 !border-info/50" />

      {/* Table header */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-bg-tertiary border-b border-border-primary">
        <div className="h-2.5 w-2.5 rounded-sm bg-accent/70 shrink-0" />
        <span className="text-xs font-semibold text-text-primary truncate">
          {data.label}
        </span>
        <span className="ml-auto text-[10px] text-text-muted">
          {data.columns.length}
        </span>
      </div>

      {/* Columns */}
      <div className="py-0.5">
        {data.columns.map((col) => {
          const isFk = data.fkColumns.has(col.name);
          return (
            <div
              key={col.name}
              className="flex items-center gap-1.5 px-2.5 py-0.5 text-[11px] hover:bg-bg-hover transition-colors"
            >
              {col.is_primary_key ? (
                <Key className="h-3 w-3 text-accent shrink-0" />
              ) : isFk ? (
                <ArrowRight className="h-3 w-3 text-info shrink-0" />
              ) : (
                <span className="h-3 w-3 shrink-0 flex items-center justify-center">
                  <span className="h-1.5 w-1.5 rounded-full bg-text-muted/30" />
                </span>
              )}
              <span
                className={`truncate ${
                  col.is_primary_key
                    ? "text-accent font-medium"
                    : isFk
                    ? "text-info"
                    : "text-text-secondary"
                }`}
              >
                {col.name}
              </span>
              <span className="ml-auto text-[10px] text-text-muted shrink-0 font-mono">
                {col.data_type}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const nodeTypes = { tableNode: TableNode };

// ── Build React Flow nodes & edges from ER data ──

function buildFlowElements(data: ErDiagramData) {
  // Build FK lookup per table
  const fkByTable = new Map<string, Set<string>>();
  for (const rel of data.relationships) {
    if (!fkByTable.has(rel.source_table)) {
      fkByTable.set(rel.source_table, new Set());
    }
    fkByTable.get(rel.source_table)!.add(rel.source_column);
  }

  const nodes: Node<TableNodeData>[] = data.tables.map((table) => ({
    id: table.name,
    type: "tableNode",
    position: { x: 0, y: 0 },
    data: {
      label: table.name,
      columns: table.columns,
      fkColumns: fkByTable.get(table.name) ?? new Set(),
    },
  }));

  const edges: Edge[] = data.relationships.map((rel) => ({
    id: rel.name,
    source: rel.source_table,
    target: rel.target_table,
    sourceHandle: null,
    targetHandle: null,
    type: "smoothstep",
    animated: false,
    style: { stroke: "var(--color-info)", strokeWidth: 1.5, opacity: 0.6 },
    label: `${rel.source_column} → ${rel.target_column}`,
    labelStyle: { fontSize: 9, fill: "var(--color-text-muted)" },
    labelBgStyle: { fill: "var(--color-bg-primary)", fillOpacity: 0.8 },
    labelBgPadding: [4, 2] as [number, number],
    labelBgBorderRadius: 3,
  }));

  return { nodes, edges };
}

// ── Inner component (needs ReactFlowProvider) ──

function ERDiagramInner({ schema }: { schema: string }) {
  const { t } = useTranslation("database");
  const { activeConnectionId } = useConnectionStore();
  const { fitView } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<TableNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ columns: 0, relationships: 0 });

  useEffect(() => {
    if (!activeConnectionId) return;
    setIsLoading(true);
    setError(null);

    invoke<ErDiagramData>("get_er_diagram_data", {
      connectionId: activeConnectionId,
      schema,
    })
      .then(async (data) => {
        const { nodes: rawNodes, edges: rawEdges } = buildFlowElements(data);
        const { nodes: layoutedNodes, edges: layoutedEdges } = await layoutWithElk(rawNodes, rawEdges);
        setNodes(layoutedNodes);
        setEdges(layoutedEdges);
        setStats({
          columns: data.tables.reduce((s, t) => s + t.columns.length, 0),
          relationships: data.relationships.length,
        });

        // Fit view after a short delay so nodes get measured
        setTimeout(() => fitView({ padding: 0.15 }), 50);
      })
      .catch((err) => setError(String(err)))
      .finally(() => setIsLoading(false));
  }, [activeConnectionId, schema]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-text-muted mx-auto" />
          <p className="mt-2 text-xs text-text-muted">{t("erDiagram.loading")}</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-danger">{error}</p>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-text-muted">{t("erDiagram.empty")}</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full er-diagram">
      {/* Stats badge */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2 text-[10px] text-text-muted bg-bg-secondary/80 rounded px-2 py-1 border border-border-primary">
        <span>{t("erDiagram.columns", { count: stats.columns })}</span>
        <span>{t("erDiagram.relationships", { count: stats.relationships })}</span>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--color-text-muted)"
          style={{ opacity: 0.15 }}
        />
        <Controls
          showInteractive={false}
          className="er-controls"
        />
        <MiniMap
          nodeColor="var(--color-bg-tertiary)"
          nodeStrokeColor="var(--color-border-primary)"
          maskColor="rgba(0,0,0,0.3)"
          className="er-minimap"
          pannable
          zoomable
        />
      </ReactFlow>
    </div>
  );
}

// ── Wrapper with provider ──

interface Props {
  schema: string;
}

export default function ERDiagram({ schema }: Props) {
  return (
    <ReactFlowProvider>
      <ERDiagramInner schema={schema} />
    </ReactFlowProvider>
  );
}
