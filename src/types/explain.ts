export interface ExplainPlanNode {
  nodeType: string;
  relationName: string | null;
  schema: string | null;
  alias: string | null;
  joinType: string | null;
  indexName: string | null;
  indexCond: string | null;
  filter: string | null;
  hashCond: string | null;
  mergeCond: string | null;
  sortKey: string[] | null;
  startupCost: number;
  totalCost: number;
  planRows: number;
  planWidth: number;
  actualStartupTime: number | null;
  actualTotalTime: number | null;
  actualRows: number | null;
  actualLoops: number | null;
  rowsRemovedByFilter: number | null;
  sharedHitBlocks: number | null;
  sharedReadBlocks: number | null;
  output: string[] | null;
  children: ExplainPlanNode[];
  extra: Record<string, unknown>;
}

export interface ExplainResult {
  plan: ExplainPlanNode;
  planningTime: number | null;
  executionTime: number | null;
  totalCost: number;
  maxActualTime: number;
  executionTimeMs: number;
}

export function fromRustExplainNode(raw: any): ExplainPlanNode {
  return {
    nodeType: raw.node_type,
    relationName: raw.relation_name,
    schema: raw.schema,
    alias: raw.alias,
    joinType: raw.join_type,
    indexName: raw.index_name,
    indexCond: raw.index_cond,
    filter: raw.filter,
    hashCond: raw.hash_cond,
    mergeCond: raw.merge_cond,
    sortKey: raw.sort_key,
    startupCost: raw.startup_cost,
    totalCost: raw.total_cost,
    planRows: raw.plan_rows,
    planWidth: raw.plan_width,
    actualStartupTime: raw.actual_startup_time,
    actualTotalTime: raw.actual_total_time,
    actualRows: raw.actual_rows,
    actualLoops: raw.actual_loops,
    rowsRemovedByFilter: raw.rows_removed_by_filter,
    sharedHitBlocks: raw.shared_hit_blocks,
    sharedReadBlocks: raw.shared_read_blocks,
    output: raw.output,
    children: (raw.children || []).map(fromRustExplainNode),
    extra: raw.extra || {},
  };
}

export function fromRustExplainResult(raw: any): ExplainResult {
  return {
    plan: fromRustExplainNode(raw.plan),
    planningTime: raw.planning_time,
    executionTime: raw.execution_time,
    totalCost: raw.total_cost,
    maxActualTime: raw.max_actual_time,
    executionTimeMs: raw.execution_time_ms,
  };
}
