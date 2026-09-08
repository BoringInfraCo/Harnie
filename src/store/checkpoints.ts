import { DatabaseSync } from "node:sqlite";
import { deriveObservedWork } from "../work/derive.js";
import { reconcileToolDiagnostics } from "../work/observe.js";
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
  Work,
} from "../work/types.js";

// Test seam: invoked inside the checkpoint transaction after the event
// watermark is pinned and before the snapshot's semantic state is derived.
export interface CheckpointFaultHooks {
  afterWatermarkCapture?: ((context: { readonly workId: string; readonly watermark: number }) => void) | undefined;
}

export const checkpointFaultHooks: CheckpointFaultHooks = {};

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
  // Outside the transaction: the "Work not found" check and any pending legacy
  // schema migration, so migrations never nest inside the snapshot transaction.
  const known = loadWork(store, workId);
  if (known === undefined) {
    throw new Error(`Work not found: ${workId}`);
  }
  const db = storeDatabase(store);
  ensureCheckpointsSchema(db);
  const createdAt = new Date().toISOString();

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

    checkpointFaultHooks.afterWatermarkCapture?.({ workId, watermark });

    // Snapshot semantics derive from exactly the events the watermark pins:
    // events are read under the write lock and filtered to ordinal <= watermark
    // before the claims are re-derived, so no concurrent append can slip
    // between the watermark and the snapshot's semantic state.
    const pinned = loadWork(store, workId, { rawDiagnostics: true });
    if (pinned === undefined) {
      throw new Error(`Work not found: ${workId}`);
    }
    const derived = deriveObservedWork(snapshotAtWatermark(db, pinned, watermark));

    const goalJson = (derived.goal?.evidence?.length ?? 0) > 0 ? JSON.stringify(derived.goal) : null;
    const decisionsJson = JSON.stringify(derived.decisions ?? []);
    const findingsJson = JSON.stringify(derived.findings ?? []);
    const nextStepsJson = JSON.stringify(derived.nextSteps ?? []);
    const operationsJson = JSON.stringify(derived.operations ?? []);

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
      ...(derived.goal ? { goal: derived.goal } : {}),
      decisions: derived.decisions ?? [],
      findings: derived.findings ?? [],
      nextSteps: derived.nextSteps ?? [],
      operations: derived.operations ?? [],
    };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
};

// Rebuild the Work from events the watermark covers, mirroring
// loadWorkAtCheckpoint: raw rows filtered to the boundary, then reconciled so
// tool-call diagnostics agree with the pinned evidence.
const snapshotAtWatermark = (db: DatabaseSync, pinned: Work, watermark: number): Work => {
  const eventIds = new Set(
    (db
      .prepare("SELECT id FROM events WHERE work_id = ? AND ordinal <= ? ORDER BY ordinal ASC")
      .all(pinned.id, watermark) as unknown as { id: string }[]).map((row) => row.id),
  );
  const events = pinned.events.filter((event) => eventIds.has(event.id));
  const executionIds = new Set(events.map((event) => event.executionId));
  const executions = pinned.executions.filter((execution) => executionIds.has(execution.id));
  return reconcileToolDiagnostics({
    id: pinned.id,
    ...(pinned.workspace ? { workspace: pinned.workspace } : {}),
    ...(pinned.createdAt ? { createdAt: pinned.createdAt } : {}),
    ...(pinned.updatedAt ? { updatedAt: pinned.updatedAt } : {}),
    executions,
    events,
    diagnostics: [],
  });
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
  db.exec(CHECKPOINTS_SCHEMA_SQL);
};

const parseArray = <T>(text: string): readonly T[] => {
  if (text === "") return [];
  const value = JSON.parse(text) as unknown;
  return Array.isArray(value) ? (value as readonly T[]) : [];
};
