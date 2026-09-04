import { storeDatabase, type HarnieStore } from "./database.js";

export interface WorkSummary {
  readonly id: string;
  readonly workspacePath?: string;
  readonly harness?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly updatedAt?: string;
  readonly eventCount: number;
}

export interface ExecutionSummary {
  readonly id: string;
  readonly harness: string;
  readonly provider?: string;
  readonly model?: string;
  readonly sourceSessionId?: string;
  readonly startedAt?: string;
  readonly eventCount: number;
}

interface ExecutionSummaryRow {
  id: string;
  harness: string;
  provider: string | null;
  model: string | null;
  source_id: string | null;
  started_at: string | null;
  event_count: number;
}

interface WorkSummaryRow {
  id: string;
  workspace_path: string | null;
  updated_at: string | null;
  harness: string | null;
  provider: string | null;
  model: string | null;
  event_count: number;
}

export const listWorks = (store: HarnieStore): readonly WorkSummary[] => {
  const db = storeDatabase(store);
  const rows = db.prepare(`
    SELECT
      works.id AS id,
      works.workspace_path AS workspace_path,
      works.updated_at AS updated_at,
      (
        SELECT harness FROM executions
        WHERE executions.work_id = works.id
        ORDER BY executions.rowid DESC LIMIT 1
      ) AS harness,
      (
        SELECT provider FROM executions
        WHERE executions.work_id = works.id
        ORDER BY executions.rowid DESC LIMIT 1
      ) AS provider,
      (
        SELECT model FROM executions
        WHERE executions.work_id = works.id
        ORDER BY executions.rowid DESC LIMIT 1
      ) AS model,
      (
        SELECT COUNT(*)
        FROM events
        WHERE events.work_id = works.id
      ) AS event_count
    FROM works
    ORDER BY works.updated_at DESC, works.id
  `).all() as unknown as WorkSummaryRow[];

  return rows.map(toWorkSummary);
};

const toWorkSummary = (row: WorkSummaryRow): WorkSummary => ({
  id: row.id,
  ...(row.workspace_path ? { workspacePath: row.workspace_path } : {}),
  ...(row.harness ? { harness: row.harness } : {}),
  ...(row.provider ? { provider: row.provider } : {}),
  ...(row.model ? { model: row.model } : {}),
  ...(row.updated_at ? { updatedAt: row.updated_at } : {}),
  eventCount: Number(row.event_count),
});

export const listExecutions = (store: HarnieStore, workId: string): readonly ExecutionSummary[] => {
  const db = storeDatabase(store);
  const rows = db.prepare(`
    SELECT
      executions.id AS id,
      executions.harness AS harness,
      executions.provider AS provider,
      executions.model AS model,
      source_sessions.source_id AS source_id,
      executions.started_at AS started_at,
      (
        SELECT COUNT(*)
        FROM events
        WHERE events.execution_id = executions.id
      ) AS event_count
    FROM executions
    LEFT JOIN source_sessions ON source_sessions.execution_id = executions.id
    WHERE executions.work_id = ?
    ORDER BY executions.rowid ASC
  `).all(workId) as unknown as ExecutionSummaryRow[];

  return rows.map((row) => ({
    id: row.id,
    harness: row.harness,
    ...(row.provider ? { provider: row.provider } : {}),
    ...(row.model ? { model: row.model } : {}),
    ...(row.source_id ? { sourceSessionId: row.source_id } : {}),
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    eventCount: Number(row.event_count),
  }));
};
