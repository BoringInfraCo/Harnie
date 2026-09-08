import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createCheckpoint, listCheckpoints } from "../src/store/checkpoints.js";
import { databasePath, initHarnieStore, storeDatabase } from "../src/store/database.js";
import { createFork } from "../src/store/fork.js";
import { loadWork, persistObservedWork } from "../src/store/persist.js";
import { CURRENT_SCHEMA_VERSION } from "../src/store/schema.js";
import type { Work } from "../src/work/types.js";

const homes: string[] = [];

const makeHome = async (): Promise<string> => {
  const home = await mkdtemp(join(tmpdir(), "harnie-finding-5-"));
  homes.push(home);
  return home;
};

const PROVENANCE = JSON.stringify({ harness: "pi", line: 1, observation: "observed" });

const createLegacyCore = (db: DatabaseSync): void => {
  db.exec(`CREATE TABLE works (
    id TEXT PRIMARY KEY,
    workspace_path TEXT,
    created_at TEXT,
    updated_at TEXT,
    diagnostics TEXT NOT NULL DEFAULT '[]'
  )`);
  db.exec(`CREATE TABLE executions (
    id TEXT PRIMARY KEY,
    work_id TEXT NOT NULL REFERENCES works(id),
    harness TEXT NOT NULL,
    model TEXT,
    provider TEXT,
    started_at TEXT
  )`);
  db.exec(`CREATE TABLE source_sessions (
    execution_id TEXT PRIMARY KEY REFERENCES executions(id),
    harness TEXT NOT NULL,
    source_id TEXT NOT NULL,
    source_format TEXT,
    source_location TEXT,
    UNIQUE (harness, source_id)
  )`);
  db.exec(`CREATE TABLE events (
    id TEXT PRIMARY KEY,
    work_id TEXT NOT NULL REFERENCES works(id),
    execution_id TEXT NOT NULL REFERENCES executions(id),
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
    UNIQUE (harness, source_session_id, source_event_id)
  )`);
  db.prepare(
    "INSERT INTO works (id, workspace_path, created_at, updated_at, diagnostics) VALUES (?, ?, ?, ?, ?)",
  ).run("work:old:1", "/workspace/old", "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z", "[]");
  db.prepare("INSERT INTO executions (id, work_id, harness) VALUES (?, ?, ?)").run(
    "execution:old:1",
    "work:old:1",
    "pi",
  );
  db.prepare("INSERT INTO source_sessions (execution_id, harness, source_id) VALUES (?, ?, ?)").run(
    "execution:old:1",
    "pi",
    "s-old-1",
  );
  db.prepare(`INSERT INTO events (id, work_id, execution_id, kind, payload, provenance, diagnostics,
    harness, source_session_id, source_event_id, provenance_line, ordinal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "event:old:1",
    "work:old:1",
    "execution:old:1",
    "message",
    "{}",
    PROVENANCE,
    "[]",
    "pi",
    "s-old-1",
    "event:old:1",
    1,
    0,
  );
};

/** Legacy checkpoint shape from the audit: execution_id references executions. */
const createLegacyCheckpoints = (db: DatabaseSync): void => {
  db.exec(`CREATE TABLE checkpoints (
    id TEXT PRIMARY KEY,
    work_id TEXT NOT NULL REFERENCES works(id),
    execution_id TEXT REFERENCES executions(id),
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
  for (const [id, date] of [["checkpoint:old:1", "2026-01-03"], ["checkpoint:old:2", "2026-01-02"]]) {
    db.prepare(`INSERT INTO checkpoints
      (id, work_id, execution_id, message, created_at, event_ordinal_watermark, event_count,
       goal_json, decisions_json, findings_json, next_steps_json, operations_json)
      VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?)`).run(
      id!,
      "work:old:1",
      "execution:old:1",
      "frozen history",
      date!,
      JSON.stringify({ statement: "Original goal", evidence: ["event:old:1"] }),
      '[{"summary":"Original decision"}]',
      '[{"statement":"Original finding"}]',
      '[{"description":"Original next step"}]',
      '[{"status":"pending"}]',
    );
  }
};

const dumpTable = (db: DatabaseSync, table: string, orderBy: string): readonly unknown[] =>
  db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy}`).all() as unknown as readonly unknown[];

const appliedVersions = (db: DatabaseSync): readonly number[] =>
  (db.prepare("SELECT version FROM schema_migrations ORDER BY version ASC").all() as unknown as {
    version: number;
  }[]).map((row) => row.version);

describe("finding 5 — legacy checkpoint migration", () => {
  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("migrates the audit's legacy checkpoint shape without `no such column: rowid`", async () => {
    const home = await makeHome();
    const raw = new DatabaseSync(databasePath(home));
    try {
      createLegacyCore(raw);
      createLegacyCheckpoints(raw);
    } finally {
      raw.close();
    }

    const before = new DatabaseSync(databasePath(home));
    const snapshots = {
      works: dumpTable(before, "works", "id"),
      executions: dumpTable(before, "executions", "id"),
      source_sessions: dumpTable(before, "source_sessions", "execution_id"),
      events: dumpTable(before, "events", "ordinal"),
      checkpoints: dumpTable(before, "checkpoints", "rowid"),
    };
    before.close();

    // Exact audit repro: the migration branch must not fail on the index build.
    const store = initHarnieStore({ home });
    try {
      const loaded = loadWork(store, "work:old:1");
      expect(loaded?.executions).toHaveLength(1);
      expect(loaded?.events).toHaveLength(1);

      const db = storeDatabase(store);
      // Row preservation across every migrated table, including checkpoints/forks columns.
      // The works table gains nullable goal/fork columns via ADD COLUMN; values stay NULL.
      expect(
        db.prepare("SELECT id, workspace_path, created_at, updated_at, diagnostics FROM works ORDER BY id").all(),
      ).toEqual(snapshots.works);
      expect(dumpTable(db, "executions", "id")).toEqual(snapshots.executions);
      // source_sessions gains work_id in v1; values are backfilled from executions.
      expect(
        db.prepare("SELECT execution_id, harness, source_id, source_format, source_location FROM source_sessions ORDER BY execution_id").all(),
      ).toEqual(snapshots.source_sessions);
      expect(
        db.prepare("SELECT work_id, execution_id FROM source_sessions ORDER BY execution_id").all(),
      ).toEqual([{ work_id: "work:old:1", execution_id: "execution:old:1" }]);
      expect(dumpTable(db, "events", "ordinal")).toEqual(snapshots.events);
      expect(dumpTable(db, "checkpoints", "rowid")).toEqual(snapshots.checkpoints);
      // The migrated index must be explicit and valid: work_id only, no rowid.
      expect(
        (db.prepare("SELECT sql FROM sqlite_master WHERE name = 'idx_checkpoints_work_seq'").get() as unknown as {
          sql: string;
        }).sql,
      ).toBe("CREATE INDEX idx_checkpoints_work_seq ON checkpoints(work_id)");
      expect(listCheckpoints(store, "work:old:1").map((checkpoint) => checkpoint.id)).toEqual([
        "checkpoint:old:1",
        "checkpoint:old:2",
      ]);
      // Foreign-key integrity holds and enforcement is re-enabled after migration.
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect((db.prepare("PRAGMA foreign_keys").get() as unknown as { foreign_keys: number }).foreign_keys).toBe(1);
    } finally {
      store.close();
    }
  });

  it("migrates an old-shape database with no checkpoints table and stamps the schema version", async () => {
    const home = await makeHome();
    const raw = new DatabaseSync(databasePath(home));
    try {
      createLegacyCore(raw);
    } finally {
      raw.close();
    }

    const store = initHarnieStore({ home });
    try {
      expect(loadWork(store, "work:old:1")?.events).toHaveLength(1);
      const db = storeDatabase(store);
      // Checkpoints storage is created fresh; the core migration preserved the event.
      expect(listCheckpoints(store, "work:old:1")).toEqual([]);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(appliedVersions(db)).toEqual(
        Array.from({ length: CURRENT_SCHEMA_VERSION }, (_, index) => index + 1),
      );
    } finally {
      store.close();
    }
  });

  it("records versioned migrations transactionally and reopens idempotently", async () => {
    const home = await makeHome();
    const raw = new DatabaseSync(databasePath(home));
    try {
      createLegacyCore(raw);
      createLegacyCheckpoints(raw);
    } finally {
      raw.close();
    }

    const first = initHarnieStore({ home });
    let checkpointsAfterFirst: readonly unknown[];
    try {
      expect(loadWork(first, "work:old:1")?.events).toHaveLength(1);
      const db = storeDatabase(first);
      checkpointsAfterFirst = dumpTable(db, "checkpoints", "rowid");
      expect(appliedVersions(db)).toEqual(
        Array.from({ length: CURRENT_SCHEMA_VERSION }, (_, index) => index + 1),
      );
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      first.close();
    }

    // Reopening must be a no-op: same rows, same versions, same loaded work.
    const second = initHarnieStore({ home });
    try {
      expect(loadWork(second, "work:old:1")?.events).toHaveLength(1);
      const db = storeDatabase(second);
      expect(dumpTable(db, "checkpoints", "rowid")).toEqual(checkpointsAfterFirst);
      expect(appliedVersions(db)).toEqual(
        Array.from({ length: CURRENT_SCHEMA_VERSION }, (_, index) => index + 1),
      );
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      second.close();
    }
  });

  it("preserves populated checkpoints and fork lineage with foreign-key integrity", async () => {
    const home = await makeHome();
    const work: Work = {
      id: "work:f5:parent",
      workspace: { path: "/workspace/f5" },
      executions: [
        {
          id: "execution:f5:1",
          workId: "work:f5:parent",
          harness: "pi",
          sourceSession: { harness: "pi", sourceId: "s-f5" },
        },
      ],
      events: [
        {
          id: "event:f5:1",
          workId: "work:f5:parent",
          executionId: "execution:f5:1",
          kind: "message",
          payload: { role: "user", text: "fix the bug" },
          provenance: { harness: "pi", line: 1, observation: "observed" },
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };

    const store = initHarnieStore({ home });
    let childId: string;
    try {
      persistObservedWork(store, work);
      createCheckpoint(store, work.id, "before fork");
      childId = createFork(store, work.id, "explore").workId;
    } finally {
      store.close();
    }

    const snapshot = new DatabaseSync(databasePath(home));
    const before = {
      works: dumpTable(snapshot, "works", "id"),
      executions: dumpTable(snapshot, "executions", "work_id, id"),
      events: dumpTable(snapshot, "events", "work_id, ordinal"),
      checkpoints: dumpTable(snapshot, "checkpoints", "rowid"),
    };
    snapshot.close();

    const reopened = initHarnieStore({ home });
    try {
      const db = storeDatabase(reopened);
      expect(dumpTable(db, "works", "id")).toEqual(before.works);
      expect(dumpTable(db, "executions", "work_id, id")).toEqual(before.executions);
      expect(dumpTable(db, "events", "work_id, ordinal")).toEqual(before.events);
      expect(dumpTable(db, "checkpoints", "rowid")).toEqual(before.checkpoints);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      const parent = loadWork(reopened, work.id);
      const child = loadWork(reopened, childId!);
      expect(parent?.events).toHaveLength(1);
      expect(child?.events).toHaveLength(1);
      expect(child?.forkedFrom?.workId).toBe(work.id);
      expect(listCheckpoints(reopened, work.id)).toHaveLength(1);
    } finally {
      reopened.close();
    }
  });
});
