import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { reconcileToolDiagnostics } from "../work/observe.js";
import { deriveObservedWork } from "../work/derive.js";
import type { Checkpoint, Work } from "../work/types.js";
import { createCheckpoint, listCheckpoints } from "./checkpoints.js";
import { storeDatabase, type HarnieStore } from "./database.js";
import { loadWork } from "./persist.js";

export interface CreateForkResult {
  readonly workId: string;
  readonly checkpointId: string;
}

// Test seam: invoked inside the fork transaction after events are copied and
// before the fork's derived state is persisted; a throw rolls back the whole
// fork so no partial fork can become visible.
export interface ForkFaultHooks {
  beforeDerivedClaimsPersist?: (() => void) | undefined;
}

export const forkFaultHooks: ForkFaultHooks = {};

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
  const parent = loadWork(store, workId, { rawDiagnostics: true });
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
  // The child's derived state is computed from exactly the events the fork
  // copies (ordinal <= checkpoint watermark), so both halves share one pinned
  // event set and can be committed atomically below.
  const childDerived = deriveObservedWork(
    reconcileToolDiagnostics(childSeed(db, parent, childId, workId, checkpoint, message, now, watermark)),
  );

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
    forkFaultHooks.beforeDerivedClaimsPersist?.();
    persistForkDerivedClaims(db, childId, childDerived);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return { workId: childId, checkpointId: checkpoint.id };
};

// Build the child Work in memory from the parent's rows at the checkpoint
// watermark, mirroring loadWorkAtCheckpoint's boundary reconstruction.
const childSeed = (
  db: DatabaseSync,
  parent: Work,
  childId: string,
  workId: string,
  checkpoint: Checkpoint,
  message: string,
  now: string,
  watermark: number,
): Work => {
  const eventIds = new Set(
    (db
      .prepare("SELECT id FROM events WHERE work_id = ? AND ordinal <= ? ORDER BY ordinal ASC")
      .all(workId, watermark) as unknown as { id: string }[]).map((row) => row.id),
  );
  const events = parent.events.filter((event) => eventIds.has(event.id));
  const executionIds = new Set(events.map((event) => event.executionId));
  const executions = parent.executions.filter((execution) => executionIds.has(execution.id));
  return {
    id: childId,
    ...(parent.workspace ? { workspace: parent.workspace } : {}),
    ...(parent.createdAt ? { createdAt: parent.createdAt } : {}),
    updatedAt: now,
    executions,
    events,
    diagnostics: [],
    forkedFrom: { workId, checkpointId: checkpoint.id, message },
  };
};

// Persist the fork's derived claims with the same semantics as
// persistDerivedClaims in persist.ts: only claims with evidence (and an id)
// are stored, goal only with evidence. Runs inside the fork transaction.
const persistForkDerivedClaims = (db: DatabaseSync, workId: string, derived: Work): void => {
  const goalJson = (derived.goal?.evidence?.length ?? 0) > 0 ? JSON.stringify(derived.goal) : null;
  db.prepare("UPDATE works SET goal_json = ? WHERE id = ?").run(goalJson, workId);

  const insertDecision = db.prepare(`
    INSERT INTO decisions (id, work_id, summary, evidence, provenance, rule, ordinal)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  let decisionOrdinal = 0;
  for (const decision of derived.decisions ?? []) {
    if ((decision.evidence?.length ?? 0) === 0 || decision.id === "") continue;
    insertDecision.run(
      decision.id,
      workId,
      decision.summary,
      JSON.stringify(decision.evidence),
      JSON.stringify(decision.provenance),
      decision.rule,
      decisionOrdinal,
    );
    decisionOrdinal += 1;
  }

  const insertFinding = db.prepare(`
    INSERT INTO findings (id, work_id, statement, evidence, provenance, rule, ordinal)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  let findingOrdinal = 0;
  for (const finding of derived.findings ?? []) {
    if ((finding.evidence?.length ?? 0) === 0 || finding.id === "") continue;
    insertFinding.run(
      finding.id,
      workId,
      finding.statement,
      JSON.stringify(finding.evidence),
      JSON.stringify(finding.provenance),
      finding.rule,
      findingOrdinal,
    );
    findingOrdinal += 1;
  }

  const insertNextStep = db.prepare(`
    INSERT INTO next_steps (id, work_id, description, evidence, provenance, rule, ordinal)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  let nextStepOrdinal = 0;
  for (const nextStep of derived.nextSteps ?? []) {
    if ((nextStep.evidence?.length ?? 0) === 0 || nextStep.id === "") continue;
    insertNextStep.run(
      nextStep.id,
      workId,
      nextStep.description,
      JSON.stringify(nextStep.evidence),
      JSON.stringify(nextStep.provenance),
      nextStep.rule,
      nextStepOrdinal,
    );
    nextStepOrdinal += 1;
  }

  const insertOperation = db.prepare(`
    INSERT INTO operations (id, work_id, tool_name, path, command, status, note, evidence, provenance, rule, ordinal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  let operationOrdinal = 0;
  for (const operation of derived.operations ?? []) {
    if ((operation.evidence?.length ?? 0) === 0 || operation.id === "") continue;
    insertOperation.run(
      operation.id,
      workId,
      operation.toolName ?? null,
      operation.path ?? null,
      operation.command ?? null,
      operation.status,
      operation.note ?? null,
      JSON.stringify(operation.evidence),
      JSON.stringify(operation.provenance),
      operation.rule,
      operationOrdinal,
    );
    operationOrdinal += 1;
  }
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
