import { DatabaseSync } from "node:sqlite";
import { storeDatabase, type HarnieStore } from "./database.js";
import { loadWork } from "./persist.js";
import { CHECKPOINTS_SCHEMA_SQL } from "./schema.js";
import type {
  Checkpoint,
  Decision,
  DerivedGoal,
  Finding,
  NextStep,
  ToolOperation,
} from "../work/types.js";

interface CheckpointRow {
  id: string;
  work_id: string;
  execution_id: string | null;
  message: string;
  created_at: string;
  event_ordinal_watermark: number;
  event_count: number;
  goal_json: string | null;
  decisions_json: string;
  findings_json: string;
  next_steps_json: string;
  operations_json: string;
}

export const createCheckpoint = (store: HarnieStore, workId: string, message: string): Checkpoint => {
  const work = loadWork(store, workId);
  if (work === undefined) {
    throw new Error(`Work not found: ${workId}`);
  }
  const db = storeDatabase(store);
  ensureCheckpointsSchema(db);
  const createdAt = new Date().toISOString();
  const goalJson = work.goal ? JSON.stringify(work.goal) : null;
  const decisionsJson = JSON.stringify(work.decisions ?? []);
  const findingsJson = JSON.stringify(work.findings ?? []);
  const nextStepsJson = JSON.stringify(work.nextSteps ?? []);
  const operationsJson = JSON.stringify(work.operations ?? []);

  db.exec("BEGIN IMMEDIATE");
  try {
    const countRow = db
      .prepare("SELECT COUNT(*) AS count FROM checkpoints WHERE work_id = ?")
      .get(workId) as unknown as { count: number };
    const seq = Number(countRow.count) + 1;
    const id = `checkpoint:${workId}:${String(seq).padStart(4, "0")}`;

    const execRow = db
      .prepare("SELECT id FROM executions WHERE work_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(workId) as unknown as { id: string } | undefined;
    const executionId = execRow?.id;

    const watermarkRow = db
      .prepare("SELECT COALESCE(MAX(ordinal), -1) AS max_ordinal FROM events WHERE work_id = ?")
      .get(workId) as unknown as { max_ordinal: number };
    const watermark = Number(watermarkRow.max_ordinal);

    const eventCountRow = db
      .prepare("SELECT COUNT(*) AS count FROM events WHERE work_id = ?")
      .get(workId) as unknown as { count: number };
    const eventCount = Number(eventCountRow.count);

    db.prepare(
      `INSERT INTO checkpoints (
        id, work_id, execution_id, message, created_at,
        event_ordinal_watermark, event_count,
        goal_json, decisions_json, findings_json, next_steps_json, operations_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      workId,
      executionId ?? null,
      message,
      createdAt,
      watermark,
      eventCount,
      goalJson,
      decisionsJson,
      findingsJson,
      nextStepsJson,
      operationsJson,
    );
    db.exec("COMMIT");
    return {
      id,
      workId,
      ...(executionId !== undefined ? { executionId } : {}),
      message,
      createdAt,
      eventOrdinalWatermark: watermark,
      eventCount,
      ...(work.goal ? { goal: work.goal } : {}),
      decisions: work.decisions ?? [],
      findings: work.findings ?? [],
      nextSteps: work.nextSteps ?? [],
      operations: work.operations ?? [],
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

export const listCheckpoints = (store: HarnieStore, workId: string): readonly Checkpoint[] => {
  const db = storeDatabase(store);
  ensureCheckpointsSchema(db);
  const rows = db
    .prepare(
      `SELECT id, work_id, execution_id, message, created_at,
        event_ordinal_watermark, event_count,
        goal_json, decisions_json, findings_json, next_steps_json, operations_json
      FROM checkpoints WHERE work_id = ? ORDER BY rowid ASC`,
    )
    .all(workId) as unknown as CheckpointRow[];
  return rows.map(toCheckpoint);
};

const toCheckpoint = (row: CheckpointRow): Checkpoint => {  const goal = parseGoal(row.goal_json);
  const decisions = parseArray<Decision>(row.decisions_json);
  const findings = parseArray<Finding>(row.findings_json);
  const nextSteps = parseArray<NextStep>(row.next_steps_json);
  const operations = parseArray<ToolOperation>(row.operations_json);
  return {
    id: row.id,
    workId: row.work_id,
    ...(row.execution_id !== null ? { executionId: row.execution_id } : {}),
    message: row.message,
    createdAt: row.created_at,
    eventOrdinalWatermark: Number(row.event_ordinal_watermark),
    eventCount: Number(row.event_count),
    ...(goal ? { goal } : {}),
    decisions,
    findings,
    nextSteps,
    operations,
  };
};

const parseGoal = (text: string | null): DerivedGoal | undefined => {
  if (text === null || text === "") return undefined;
  return JSON.parse(text) as DerivedGoal;
};

const ensureCheckpointsSchema = (db: DatabaseSync): void => {
  try {
    db.exec(CHECKPOINTS_SCHEMA_SQL);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/no such column: rowid/i.test(message)) throw error;
    db.exec(CHECKPOINTS_SCHEMA_SQL.slice(0, CHECKPOINTS_SCHEMA_SQL.indexOf("CREATE INDEX")));
  }
};

const parseArray = <T>(text: string): readonly T[] => {
  if (text === "") return [];
  const value = JSON.parse(text) as unknown;
  return Array.isArray(value) ? (value as readonly T[]) : [];
};
