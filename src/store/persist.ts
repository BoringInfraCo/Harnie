import { DatabaseSync } from "node:sqlite";
import type { Diagnostic, JsonObject, JsonValue, NormalizedEventKind } from "../types.js";
import type {
  Decision,
  DerivedGoal,
  Execution,
  Finding,
  NextStep,
  ObservationClass,
  Provenance,
  SourceSession,
  ToolOperation,
  Work,
  WorkEvent,
  Workspace,
} from "../work/types.js";
import { reconcileToolDiagnostics } from "../work/observe.js";
import { isJsonObject } from "../types.js";
import { storeDatabase, type HarnieStore } from "./database.js";
import { CHECKPOINTS_INDEX_SQL, CHECKPOINTS_SCHEMA_SQL, CURRENT_SCHEMA_VERSION, DERIVED_SCHEMA_SQL, SCHEMA_MIGRATIONS_SQL } from "./schema.js";

export interface PersistObservedWorkResult {
  readonly workId: string;
  readonly executionId: string;
  readonly eventsInserted: number;
  readonly eventsExisting: number;
  readonly created: boolean;
}

interface WorkRow {
  id: string;
  workspace_path: string | null;
  created_at: string | null;
  updated_at: string | null;
  diagnostics: string;
  goal_json: string | null;
  forked_from_work_id: string | null;
  forked_from_checkpoint_id: string | null;
  fork_message: string | null;
}

interface ExecutionRow {
  id: string;
  work_id: string;
  harness: string;
  model: string | null;
  provider: string | null;
  started_at: string | null;
}

interface SourceSessionRow {
  execution_id: string;
  harness: string;
  source_id: string;
  source_format: string | null;
  source_location: string | null;
}

interface EventRow {
  id: string;
  work_id: string;
  execution_id: string;
  kind: string;
  timestamp: string | null;
  payload: string;
  provenance: string;
  diagnostics: string;
}

interface DecisionRow {
  id: string;
  summary: string;
  evidence: string;
  provenance: string;
  rule: string;
}

interface FindingRow {
  id: string;
  statement: string;
  evidence: string;
  provenance: string;
  rule: string;
}

interface NextStepRow {
  id: string;
  description: string;
  evidence: string;
  provenance: string;
  rule: string;
}

interface OperationRow {
  id: string;
  tool_name: string | null;
  path: string | null;
  command: string | null;
  status: string;
  note: string | null;
  evidence: string;
  provenance: string;
  rule: string;
}

export const persistObservedWork = (store: HarnieStore, work: Work): PersistObservedWorkResult => {
  const db = storeDatabase(store);
  ensureDerivedSchema(db);
  if (work.executions.length === 0) {
    throw new Error(`Work ${work.id} has no execution to persist.`);
  }

  const existing = db.prepare("SELECT id FROM works WHERE id = ?").get(work.id) as unknown as { id: string } | undefined;
  const created = existing === undefined;

  db.exec("BEGIN IMMEDIATE");
  let eventsInserted = 0;
  let lastExecutionId = work.executions[work.executions.length - 1]?.id ?? "";
  try {
    db.prepare(`
      INSERT INTO works (id, workspace_path, created_at, updated_at, diagnostics)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        workspace_path = excluded.workspace_path,
        updated_at = excluded.updated_at,
        diagnostics = excluded.diagnostics
    `).run(
      work.id,
      work.workspace?.path ?? null,
      work.createdAt ?? null,
      work.updatedAt ?? null,
      JSON.stringify(work.diagnostics),
    );

    const upsertExecution = db.prepare(`
      INSERT INTO executions (id, work_id, harness, model, provider, started_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(work_id, id) DO UPDATE SET
        harness = excluded.harness,
        model = excluded.model,
        provider = excluded.provider,
        started_at = excluded.started_at
    `);
    const upsertSourceSession = db.prepare(`
      INSERT INTO source_sessions (work_id, execution_id, harness, source_id, source_format, source_location)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(work_id, execution_id) DO UPDATE SET
        harness = excluded.harness,
        source_id = excluded.source_id,
        source_format = excluded.source_format,
        source_location = excluded.source_location
    `);
    for (const execution of work.executions) {
      upsertExecution.run(
        execution.id,
        work.id,
        execution.harness,
        execution.model ?? null,
        execution.provider ?? null,
        execution.startedAt ?? null,
      );
      upsertSourceSession.run(
        work.id,
        execution.id,
        execution.sourceSession.harness,
        execution.sourceSession.sourceId,
        execution.sourceSession.sourceFormat ?? null,
        execution.sourceSession.sourceLocation ?? null,
      );
    }

    const executionsById = new Map(work.executions.map((execution) => [execution.id, execution]));
    const knownEventIds = new Set(
      (db.prepare("SELECT id FROM events WHERE work_id = ?").all(work.id) as unknown as { id: string }[]).map(
        (row) => row.id,
      ),
    );
    const maxOrdinalRow = db.prepare("SELECT COALESCE(MAX(ordinal), -1) AS max_ordinal FROM events WHERE work_id = ?").get(
      work.id,
    ) as unknown as { max_ordinal: number };
    let nextOrdinal = Number(maxOrdinalRow.max_ordinal) + 1;

    const insertEvent = db.prepare(`
      INSERT OR IGNORE INTO events (
        id, work_id, execution_id, kind, timestamp, payload, provenance, diagnostics,
        harness, source_session_id, source_event_id, provenance_line, ordinal
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const [index, event] of work.events.entries()) {
      const execution = executionsById.get(event.executionId);
      const attributed = execution ?? work.executions[index] ?? work.executions[0];
      if (!attributed) continue;
      lastExecutionId = attributed.id;
      const sourceSessionId = event.provenance.sourceSession ?? attributed.sourceSession.sourceId;
      const ordinal = knownEventIds.has(event.id) ? 0 : nextOrdinal++;
      const result = insertEvent.run(
        event.id,
        work.id,
        attributed.id,
        event.kind,
        event.timestamp ?? null,
        JSON.stringify(event.payload),
        JSON.stringify(event.provenance),
        JSON.stringify(event.diagnostics),
        attributed.harness,
        sourceSessionId,
        event.id,
        event.provenance.line,
        ordinal,
      );
      eventsInserted += Number(result.changes);
    }

    persistDerivedClaims(db, work);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return {
    workId: work.id,
    executionId: lastExecutionId,
    eventsInserted,
    eventsExisting: work.events.length - eventsInserted,
    created,
  };
};

export const loadWork = (store: HarnieStore, workId: string, options?: { readonly rawDiagnostics?: boolean }): Work | undefined => {
  const db = storeDatabase(store);
  ensureDerivedSchema(db);
  const workRow = db.prepare(
    "SELECT id, workspace_path, created_at, updated_at, diagnostics, goal_json, forked_from_work_id, forked_from_checkpoint_id, fork_message FROM works WHERE id = ?",
  ).get(workId) as unknown as WorkRow | undefined;
  if (!workRow) return undefined;

  const executionRows = db.prepare(
    "SELECT id, work_id, harness, model, provider, started_at FROM executions WHERE work_id = ? ORDER BY rowid ASC",
  ).all(workId) as unknown as ExecutionRow[];

  const executions: Execution[] = executionRows.map((row) => {
    const sessionRow = db.prepare(
      "SELECT execution_id, harness, source_id, source_format, source_location FROM source_sessions WHERE work_id = ? AND execution_id = ?",
    ).get(row.work_id, row.id) as unknown as SourceSessionRow | undefined;
    const sourceSession: SourceSession = {
      harness: sessionRow?.harness ?? row.harness,
      sourceId: sessionRow?.source_id ?? "unknown-session",
      ...(sessionRow?.source_format ? { sourceFormat: sessionRow.source_format } : {}),
      ...(sessionRow?.source_location ? { sourceLocation: sessionRow.source_location } : {}),
    };
    return {
      id: row.id,
      workId: row.work_id,
      harness: row.harness,
      sourceSession,
      ...(row.model ? { model: row.model } : {}),
      ...(row.provider ? { provider: row.provider } : {}),
      ...(row.started_at ? { startedAt: row.started_at } : {}),
    };
  });

  const eventRows = db.prepare(
    "SELECT id, work_id, execution_id, kind, timestamp, payload, provenance, diagnostics FROM events WHERE work_id = ? ORDER BY ordinal ASC",
  ).all(workId) as unknown as EventRow[];

  const events: WorkEvent[] = eventRows.map((row) => ({
    id: row.id,
    workId: row.work_id,
    executionId: row.execution_id,
    kind: row.kind as NormalizedEventKind,
    ...(row.timestamp ? { timestamp: row.timestamp } : {}),
    payload: parseObject(row.payload),
    provenance: parseProvenance(row.provenance),
    diagnostics: parseDiagnostics(row.diagnostics),
  }));

  const workspace: Workspace | undefined = workRow.workspace_path
    ? { path: workRow.workspace_path }
    : undefined;

  const goal = parseGoal(workRow.goal_json);
  const decisions = loadDecisions(db, workId);
  const findings = loadFindings(db, workId);
  const nextSteps = loadNextSteps(db, workId);
  const operations = loadOperations(db, workId);
  const forkedFrom = workRow.forked_from_work_id
    ? {
        workId: workRow.forked_from_work_id,
        ...(workRow.forked_from_checkpoint_id ? { checkpointId: workRow.forked_from_checkpoint_id } : {}),
        ...(workRow.fork_message !== null ? { message: workRow.fork_message } : {}),
      }
    : undefined;

  const work: Work = {
    id: workRow.id,
    ...(workspace ? { workspace } : {}),
    ...(workRow.created_at ? { createdAt: workRow.created_at } : {}),
    ...(workRow.updated_at ? { updatedAt: workRow.updated_at } : {}),
    ...(forkedFrom ? { forkedFrom } : {}),
    executions,
    events,
    diagnostics: parseDiagnostics(workRow.diagnostics),
    ...(goal ? { goal } : {}),
    ...(decisions.length > 0 ? { decisions } : {}),
    ...(findings.length > 0 ? { findings } : {}),
    ...(nextSteps.length > 0 ? { nextSteps } : {}),
    ...(operations.length > 0 ? { operations } : {}),
  };
  return options?.rawDiagnostics ? work : reconcileToolDiagnostics(work);
};

const ensureDerivedSchema = (db: DatabaseSync): void => {
  db.exec(SCHEMA_MIGRATIONS_SQL);
  migratePerWorkIdentity(db);
  db.exec(DERIVED_SCHEMA_SQL);
  db.exec(CHECKPOINTS_SCHEMA_SQL);
  for (const column of [
    "ALTER TABLE works ADD COLUMN goal_json TEXT",
    "ALTER TABLE works ADD COLUMN forked_from_work_id TEXT",
    "ALTER TABLE works ADD COLUMN forked_from_checkpoint_id TEXT",
    "ALTER TABLE works ADD COLUMN fork_message TEXT",
  ]) {
    try {
      db.exec(column);
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }
  }
  // Any database that passes through current-code schema setup conforms to
  // every migration up to CURRENT_SCHEMA_VERSION; stamp idempotently so
  // reopening a healthy database is a no-op.
  stampSchemaVersions(db, allSchemaVersions());
};

const allSchemaVersions = (): readonly number[] =>
  Array.from({ length: CURRENT_SCHEMA_VERSION }, (_, index) => index + 1);

// Columns each migration rebuild SELECTs from the legacy table. A legacy table
// missing any of these would fail mid-migration with a bare SQLite error, so
// report the exact table and columns up front instead.
const LEGACY_REQUIRED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  executions: ["id", "work_id", "harness", "model", "provider", "started_at"],
  source_sessions: ["execution_id", "harness", "source_id", "source_format", "source_location"],
  events: [
    "id",
    "work_id",
    "execution_id",
    "kind",
    "timestamp",
    "payload",
    "provenance",
    "diagnostics",
    "harness",
    "source_session_id",
    "source_event_id",
    "provenance_line",
    "ordinal",
  ],
  checkpoints: [
    "id",
    "work_id",
    "execution_id",
    "message",
    "created_at",
    "event_ordinal_watermark",
    "event_count",
    "goal_json",
    "decisions_json",
    "findings_json",
    "next_steps_json",
    "operations_json",
  ],
};

const validateMigrationShapes = (
  db: DatabaseSync,
  sqlByName: ReadonlyMap<string, string>,
  needsCheckpointMigration: boolean,
): void => {
  const problems: string[] = [];
  for (const name of ["executions", "source_sessions", "events"]) {
    const sql = sqlByName.get(name) ?? "";
    if (sql === "" || sql.includes("PRIMARY KEY (work_id")) continue;
    const missing = missingColumns(db, name, LEGACY_REQUIRED_COLUMNS[name] ?? []);
    if (missing.length > 0) problems.push(`'${name}' is missing columns: ${missing.join(", ")}`);
  }
  if (needsCheckpointMigration) {
    const missing = missingColumns(db, "checkpoints", LEGACY_REQUIRED_COLUMNS["checkpoints"] ?? []);
    if (missing.length > 0) problems.push(`'checkpoints' is missing columns: ${missing.join(", ")}`);
  }
  if (problems.length > 0) {
    throw new Error(
      `Unsupported legacy store shape — migration aborted without changes (${problems.join("; ")}). ` +
        `Back up the store file before upgrading or hand-editing it.`,
    );
  }
};

const missingColumns = (db: DatabaseSync, table: string, required: readonly string[]): readonly string[] => {
  let actual: Set<string>;
  try {
    actual = new Set(
      (db.prepare(`PRAGMA table_info("${table.replace(/"/g, '""')}")`).all() as unknown as { name: string }[]).map(
        (row) => row.name,
      ),
    );
  } catch {
    return [...required];
  }
  return required.filter((column) => !actual.has(column));
};

const stampSchemaVersions = (db: DatabaseSync, versions: readonly number[]): void => {
  const stmt = db.prepare("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)");
  const appliedAt = new Date().toISOString();
  for (const version of versions) stmt.run(version, appliedAt);
};

const migratePerWorkIdentity = (db: DatabaseSync): void => {
  const rows = db.prepare(
    "SELECT name, sql FROM sqlite_master WHERE name IN ('executions','source_sessions','events')",
  ).all() as unknown as { name: string; sql: string | null }[];
  const sqlByName = new Map(rows.map((row) => [row.name, row.sql ?? ""]));
  const needsMigration = ["executions", "source_sessions", "events"].some((name) => {
    const sql = sqlByName.get(name);
    return sql !== undefined && !sql.includes("PRIMARY KEY (work_id");
  });
  const checkpointRow = db.prepare(
    "SELECT sql FROM sqlite_master WHERE name = 'checkpoints'",
  ).get() as unknown as { sql: string | null } | undefined;
  const needsCheckpointMigration = checkpointRow?.sql?.includes("REFERENCES executions") === true;
  if (!needsMigration && !needsCheckpointMigration) return;
  // Fail fast on legacy tables whose column set the rebuild SELECTs cannot
  // serve, naming the offending table before anything is touched. The
  // migration below stays rollback-safe for unexpected mid-flight failures.
  validateMigrationShapes(db, sqlByName, needsCheckpointMigration);
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN IMMEDIATE");
  try {
    let migratedCore = false;
    const executionsSql = sqlByName.get("executions") ?? "";
    if (executionsSql !== "" && !executionsSql.includes("PRIMARY KEY (work_id")) {
      db.exec(`CREATE TABLE executions_new (
        id TEXT NOT NULL,
        work_id TEXT NOT NULL REFERENCES works(id),
        harness TEXT NOT NULL,
        model TEXT,
        provider TEXT,
        started_at TEXT,
        PRIMARY KEY (work_id, id)
      )`);
      db.exec(`INSERT INTO executions_new (id, work_id, harness, model, provider, started_at)
        SELECT id, work_id, harness, model, provider, started_at FROM executions`);
      db.exec("DROP TABLE executions");
      db.exec("ALTER TABLE executions_new RENAME TO executions");
      migratedCore = true;
    }
    const sessionsSql = sqlByName.get("source_sessions") ?? "";
    if (sessionsSql !== "" && !sessionsSql.includes("PRIMARY KEY (work_id")) {
      db.exec(`CREATE TABLE source_sessions_new (
        work_id TEXT NOT NULL,
        execution_id TEXT NOT NULL,
        harness TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_format TEXT,
        source_location TEXT,
        PRIMARY KEY (work_id, execution_id),
        UNIQUE (work_id, harness, source_id),
        FOREIGN KEY (work_id, execution_id) REFERENCES executions(work_id, id)
      )`);
      // Legacy executions.id was globally unique so the join was 1:1, but the v1
      // executions shape keys by (work_id, id): an already-migrated executions
      // table (or any odd legacy shape) may repeat one execution id across
      // works and fan the join out into duplicate source_sessions rows. Group
      // by the legacy primary key so the backfill inserts exactly one row per
      // source session, deterministically attributed.
      db.exec(`INSERT INTO source_sessions_new (work_id, execution_id, harness, source_id, source_format, source_location)
        SELECT MIN(executions.work_id), source_sessions.execution_id, source_sessions.harness,
          source_sessions.source_id, source_sessions.source_format, source_sessions.source_location
        FROM source_sessions JOIN executions ON executions.id = source_sessions.execution_id
        GROUP BY source_sessions.execution_id`);
      db.exec("DROP TABLE source_sessions");
      db.exec("ALTER TABLE source_sessions_new RENAME TO source_sessions");
      migratedCore = true;
    }
    const eventsSql = sqlByName.get("events") ?? "";
    if (eventsSql !== "" && !eventsSql.includes("PRIMARY KEY (work_id")) {
      db.exec(`CREATE TABLE events_new (
        id TEXT NOT NULL,
        work_id TEXT NOT NULL REFERENCES works(id),
        execution_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        timestamp TEXT,
        payload TEXT NOT NULL,
        provenance TEXT NOT NULL,
        diagnostics TEXT NOT NULL,
        harness TEXT NOT NULL,
        source_session_id TEXT NOT NULL,
        source_event_id TEXT NOT NULL,
        provenance_line INTEGER,
        ordinal INTEGER NOT NULL,
        PRIMARY KEY (work_id, id),
        UNIQUE (work_id, harness, source_session_id, source_event_id),
        FOREIGN KEY (work_id, execution_id) REFERENCES executions(work_id, id)
      )`);
      db.exec(`INSERT INTO events_new (id, work_id, execution_id, kind, timestamp, payload, provenance,
          diagnostics, harness, source_session_id, source_event_id, provenance_line, ordinal)
        SELECT id, work_id, execution_id, kind, timestamp, payload, provenance,
          diagnostics, harness, source_session_id, source_event_id, provenance_line, ordinal FROM events`);
      db.exec("DROP TABLE events");
      db.exec("ALTER TABLE events_new RENAME TO events");
      migratedCore = true;
    }
    const checkpointNeedsRebuild = needsCheckpointMigration;
    if (checkpointNeedsRebuild) {
      db.exec(`CREATE TABLE checkpoints_new (
        id TEXT PRIMARY KEY,
        work_id TEXT NOT NULL REFERENCES works(id),
        execution_id TEXT,
        message TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        event_ordinal_watermark INTEGER NOT NULL,
        event_count INTEGER NOT NULL,
        goal_json TEXT,
        decisions_json TEXT NOT NULL DEFAULT '[]',
        findings_json TEXT NOT NULL DEFAULT '[]',
        next_steps_json TEXT NOT NULL DEFAULT '[]',
        operations_json TEXT NOT NULL DEFAULT '[]'
      )`);
      db.exec(`INSERT INTO checkpoints_new (id, work_id, execution_id, message, created_at,
          event_ordinal_watermark, event_count, goal_json, decisions_json, findings_json,
          next_steps_json, operations_json)
        SELECT id, work_id, execution_id, message, created_at,
          event_ordinal_watermark, event_count, goal_json, decisions_json, findings_json,
          next_steps_json, operations_json FROM checkpoints ORDER BY rowid ASC`);
      db.exec("DROP TABLE checkpoints");
      db.exec("ALTER TABLE checkpoints_new RENAME TO checkpoints");
      db.exec(CHECKPOINTS_INDEX_SQL);
    }
    // Stamp applied versions inside the migration transaction so a failed
    // migration rolls back its version record along with the table rebuilds.
    const applied = [...(migratedCore ? [1] : []), ...(checkpointNeedsRebuild ? [2] : [])];
    if (applied.length > 0) stampSchemaVersions(db, applied);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
};

const persistDerivedClaims = (db: DatabaseSync, work: Work): void => {
  const goalJson = (work.goal?.evidence?.length ?? 0) > 0 ? JSON.stringify(work.goal) : null;
  db.prepare("UPDATE works SET goal_json = ? WHERE id = ?").run(goalJson, work.id);

  db.prepare("DELETE FROM decisions WHERE work_id = ?").run(work.id);
  db.prepare("DELETE FROM findings WHERE work_id = ?").run(work.id);
  db.prepare("DELETE FROM next_steps WHERE work_id = ?").run(work.id);
  db.prepare("DELETE FROM operations WHERE work_id = ?").run(work.id);

  const insertDecision = db.prepare(`
    INSERT INTO decisions (id, work_id, summary, evidence, provenance, rule, ordinal)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  let decisionOrdinal = 0;
  for (const decision of work.decisions ?? []) {
    if ((decision.evidence?.length ?? 0) === 0 || decision.id === "") continue;
    insertDecision.run(
      decision.id,
      work.id,
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
  for (const finding of work.findings ?? []) {
    if ((finding.evidence?.length ?? 0) === 0 || finding.id === "") continue;
    insertFinding.run(
      finding.id,
      work.id,
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
  for (const nextStep of work.nextSteps ?? []) {
    if ((nextStep.evidence?.length ?? 0) === 0 || nextStep.id === "") continue;
    insertNextStep.run(
      nextStep.id,
      work.id,
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
  for (const operation of work.operations ?? []) {
    if ((operation.evidence?.length ?? 0) === 0 || operation.id === "") continue;
    insertOperation.run(
      operation.id,
      work.id,
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

const loadDecisions = (db: DatabaseSync, workId: string): Decision[] => {
  const rows = db.prepare(
    "SELECT id, summary, evidence, provenance, rule FROM decisions WHERE work_id = ? ORDER BY ordinal ASC",
  ).all(workId) as unknown as DecisionRow[];
  const decisions: Decision[] = [];
  for (const row of rows) {
    const evidence = parseStringArray(row.evidence);
    if (evidence.length === 0) continue;
    decisions.push({
      id: row.id,
      summary: row.summary,
      evidence,
      provenance: parseDerivedProvenance(row.provenance),
      rule: row.rule,
    });
  }
  return decisions;
};

const loadFindings = (db: DatabaseSync, workId: string): Finding[] => {
  const rows = db.prepare(
    "SELECT id, statement, evidence, provenance, rule FROM findings WHERE work_id = ? ORDER BY ordinal ASC",
  ).all(workId) as unknown as FindingRow[];
  const findings: Finding[] = [];
  for (const row of rows) {
    const evidence = parseStringArray(row.evidence);
    if (evidence.length === 0) continue;
    findings.push({
      id: row.id,
      statement: row.statement,
      evidence,
      provenance: parseDerivedProvenance(row.provenance),
      rule: row.rule,
    });
  }
  return findings;
};

const loadNextSteps = (db: DatabaseSync, workId: string): NextStep[] => {
  const rows = db.prepare(
    "SELECT id, description, evidence, provenance, rule FROM next_steps WHERE work_id = ? ORDER BY ordinal ASC",
  ).all(workId) as unknown as NextStepRow[];
  const nextSteps: NextStep[] = [];
  for (const row of rows) {
    const evidence = parseStringArray(row.evidence);
    if (evidence.length === 0) continue;
    nextSteps.push({
      id: row.id,
      description: row.description,
      evidence,
      provenance: parseDerivedProvenance(row.provenance),
      rule: row.rule,
    });
  }
  return nextSteps;
};

const loadOperations = (db: DatabaseSync, workId: string): ToolOperation[] => {
  const rows = db.prepare(
    "SELECT id, tool_name, path, command, status, note, evidence, provenance, rule FROM operations WHERE work_id = ? ORDER BY ordinal ASC",
  ).all(workId) as unknown as OperationRow[];
  const operations: ToolOperation[] = [];
  for (const row of rows) {
    const evidence = parseStringArray(row.evidence);
    const status = parseOperationStatus(row.status);
    if (evidence.length === 0 || status === undefined) continue;
    operations.push({
      id: row.id,
      ...(row.tool_name ? { toolName: row.tool_name } : {}),
      ...(row.path ? { path: row.path } : {}),
      ...(row.command ? { command: row.command } : {}),
      status,
      ...(row.note ? { note: row.note } : {}),
      evidence,
      provenance: parseDerivedProvenance(row.provenance),
      rule: row.rule,
    });
  }
  return operations;
};

const parseOperationStatus = (value: string): ToolOperation["status"] | undefined => {
  if (value === "pending" || value === "succeeded" || value === "failed") return value;
  return undefined;
};

const parseGoal = (text: string | null): DerivedGoal | undefined => {
  if (text === null || text === "") return undefined;
  const value: JsonValue = JSON.parse(text) as JsonValue;
  if (!isJsonObject(value) || !hasEvidence(value)) return undefined;
  if (typeof value.statement !== "string" || typeof value.rule !== "string" || !isJsonObject(value.provenance)) {
    return undefined;
  }
  const evidence = Array.isArray(value.evidence)
    ? value.evidence.filter((item): item is string => typeof item === "string")
    : [];
  if (evidence.length === 0) return undefined;
  return {
    statement: value.statement,
    evidence,
    provenance: provenanceFromObject(value.provenance),
    rule: value.rule,
  };
};

const hasEvidence = (claim: { readonly evidence?: readonly unknown[] | JsonValue } | undefined): boolean =>
  Array.isArray(claim?.evidence) && claim.evidence.length > 0;

const isDuplicateColumnError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  return /duplicate column name/i.test(message);
};

const parseObject = (text: string): JsonObject => {
  const value: JsonValue = JSON.parse(text) as JsonValue;
  if (!isJsonObject(value)) {
    throw new Error("Stored JSON object is invalid.");
  }
  return value;
};

const parseStringArray = (text: string): readonly string[] => {
  const value: JsonValue = JSON.parse(text) as JsonValue;
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
};

const parseDiagnostics = (text: string): readonly Diagnostic[] => {
  const value: JsonValue = JSON.parse(text) as JsonValue;
  if (!Array.isArray(value)) return [];
  return value as unknown as Diagnostic[];
};

const parseProvenance = (text: string): Provenance =>
  provenanceFromObject(parseObject(text), "observed");

const parseDerivedProvenance = (text: string): Provenance =>
  provenanceFromObject(parseObject(text));

const provenanceFromObject = (value: JsonObject, observation?: ObservationClass): Provenance => {
  const line = value.line;
  if (typeof line !== "number") {
    throw new Error("Stored provenance is missing a source line.");
  }
  const stored = value.observation === "derived" || value.observation === "observed"
    ? value.observation
    : "derived";
  return {
    harness: typeof value.harness === "string" ? value.harness : "unknown",
    ...(typeof value.sourceFormat === "string" ? { sourceFormat: value.sourceFormat } : {}),
    ...(typeof value.sourceSession === "string" ? { sourceSession: value.sourceSession } : {}),
    ...(typeof value.sourceLocation === "string" ? { sourceLocation: value.sourceLocation } : {}),
    ...(typeof value.sourceType === "string" ? { sourceType: value.sourceType } : {}),
    ...(typeof value.sourceEntry === "string" ? { sourceEntry: value.sourceEntry } : {}),
    ...("sourceParent" in value ? { sourceParent: value.sourceParent as string | null } : {}),
    line,
    ...(typeof value.contentIndex === "number" ? { contentIndex: value.contentIndex } : {}),
    ...(typeof value.toolCallId === "string" ? { toolCallId: value.toolCallId } : {}),
    observation: observation ?? stored,
  };
};
