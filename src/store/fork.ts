import { randomBytes } from "node:crypto";
import { reconcileToolDiagnostics } from "../work/observe.js";
import { deriveObservedWork } from "../work/derive.js";
import type { Checkpoint, Work } from "../work/types.js";
import { createCheckpoint, listCheckpoints } from "./checkpoints.js";
import { storeDatabase, type HarnieStore } from "./database.js";
import { loadWork, persistObservedWork } from "./persist.js";

export interface CreateForkResult {
  readonly workId: string;
  readonly checkpointId: string;
}

const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export const loadWorkAtCheckpoint = (
  store: HarnieStore,
  workId: string,
  checkpointId: string,
): Work => {
  const parent = loadWork(store, workId, { rawDiagnostics: true });
  if (parent === undefined) {
    throw new Error(`Work not found: ${workId}`);
  }
  const checkpoint = checkpointForWork(store, workId, checkpointId);
  const db = storeDatabase(store);
  const eventRows = db
    .prepare("SELECT id FROM events WHERE work_id = ? AND ordinal <= ? ORDER BY ordinal ASC")
    .all(workId, checkpoint.eventOrdinalWatermark) as unknown as { id: string }[];
  const eventIds = new Set(eventRows.map((row) => row.id));
  const events = parent.events.filter((event) => eventIds.has(event.id));
  const executionIds = new Set(events.map((event) => event.executionId));
  const executions = parent.executions.filter((execution) => executionIds.has(execution.id));

  return reconcileToolDiagnostics({
    id: parent.id,
    ...(parent.workspace ? { workspace: parent.workspace } : {}),
    ...(parent.createdAt ? { createdAt: parent.createdAt } : {}),
    updatedAt: checkpoint.createdAt,
    executions,
    events,
    diagnostics: [],
    ...(checkpoint.goal ? { goal: checkpoint.goal } : {}),
    ...(checkpoint.decisions.length > 0 ? { decisions: checkpoint.decisions } : {}),
    ...(checkpoint.findings.length > 0 ? { findings: checkpoint.findings } : {}),
    ...(checkpoint.nextSteps.length > 0 ? { nextSteps: checkpoint.nextSteps } : {}),
    ...(checkpoint.operations.length > 0 ? { operations: checkpoint.operations } : {}),
  });
};

export const createFork = (
  store: HarnieStore,
  workId: string,
  message: string,
  checkpointId?: string | undefined,
): CreateForkResult => {
  const parent = loadWork(store, workId);
  if (parent === undefined) {
    throw new Error(`Work not found: ${workId}`);
  }
  if (parent.events.length === 0) {
    throw new Error("Work has no events to fork.");
  }
  let checkpoint: Checkpoint | undefined;
  if (checkpointId !== undefined) {
    checkpoint = checkpointForWork(store, workId, checkpointId);
  } else {
    const checkpoints = listCheckpoints(store, workId);
    checkpoint = checkpoints[checkpoints.length - 1] ?? createCheckpoint(store, workId, "pre-fork");
  }

  const db = storeDatabase(store);
  let childId = "";
  for (;;) {
    const candidate = `work:fork:${encodeBase32(randomBytes(5))}`;
    const existing = db.prepare("SELECT id FROM works WHERE id = ?").get(candidate) as unknown as
      | { id: string }
      | undefined;
    if (existing === undefined) {
      childId = candidate;
      break;
    }
  }

  const now = new Date().toISOString();
  const watermark = checkpoint.eventOrdinalWatermark;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `INSERT INTO works (id, workspace_path, created_at, updated_at, diagnostics,
        forked_from_work_id, forked_from_checkpoint_id, fork_message)
      VALUES (?, ?, ?, ?, '[]', ?, ?, ?)`,
    ).run(childId, parent.workspace?.path ?? null, now, now, workId, checkpoint.id, message);
    db.prepare(
      `INSERT INTO executions (id, work_id, harness, model, provider, started_at)
      SELECT id, ?, harness, model, provider, started_at FROM executions
      WHERE work_id = ? AND id IN (
        SELECT execution_id FROM events WHERE work_id = ? AND ordinal <= ?
      )`,
    ).run(childId, workId, workId, watermark);
    db.prepare(
      `INSERT INTO source_sessions (work_id, execution_id, harness, source_id, source_format, source_location)
      SELECT ?, execution_id, harness, source_id, source_format, source_location FROM source_sessions
      WHERE work_id = ? AND execution_id IN (
        SELECT execution_id FROM events WHERE work_id = ? AND ordinal <= ?
      )`,
    ).run(childId, workId, workId, watermark);
    db.prepare(
      `INSERT INTO events (id, work_id, execution_id, kind, timestamp, payload, provenance, diagnostics,
        harness, source_session_id, source_event_id, provenance_line, ordinal)
      SELECT id, ?, execution_id, kind, timestamp, payload, provenance, diagnostics,
        harness, source_session_id, source_event_id, provenance_line, ordinal FROM events
      WHERE work_id = ? AND ordinal <= ?`,
    ).run(childId, workId, watermark);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const child = loadWork(store, childId);
  if (child === undefined) {
    throw new Error(`Work not found: ${childId}`);
  }
  persistObservedWork(store, deriveObservedWork(child));
  return { workId: childId, checkpointId: checkpoint.id };
};

const checkpointForWork = (store: HarnieStore, workId: string, checkpointId: string): Checkpoint => {
  const checkpoint = listCheckpoints(store, workId).find((entry) => entry.id === checkpointId);
  if (checkpoint === undefined) {
    throw new Error(`Checkpoint not found: ${checkpointId}`);
  }
  return checkpoint;
};

const encodeBase32 = (bytes: Uint8Array): string => {
  let value = 0;
  let bits = 0;
  let output = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
};
