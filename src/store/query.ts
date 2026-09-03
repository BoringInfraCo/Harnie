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
      executions.harness AS harness,
      executions.provider AS provider,
      executions.model AS model,
      (
        SELECT COUNT(*)
        FROM events
        WHERE events.work_id = works.id
      ) AS event_count
    FROM works
    LEFT JOIN executions ON executions.work_id = works.id
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
