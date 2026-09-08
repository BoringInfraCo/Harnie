import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { databasePath, initHarnieStore, storeDatabase } from "../src/store/database.js";
import { loadWork } from "../src/store/persist.js";
import { CURRENT_SCHEMA_VERSION, SCHEMA_SQL } from "../src/store/schema.js";

const PROVENANCE = JSON.stringify({ harness: "pi", line: 1, observation: "observed" });

const legacyCoreDdl = (db: DatabaseSync): void => {
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
};

describe("store migration hardening", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-mig-harden-"));
    homes.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("scopes the source_sessions backfill to one row per session when an execution id repeats across works", async () => {
    const home = await makeHome();
    const raw = new DatabaseSync(databasePath(home));
    try {
      // Mixed shape: executions already in v1 form with one execution id
      // shared by two works, source_sessions still legacy. The old
      // `JOIN executions ON executions.id = ...` backfill would fan out into
      // two rows for the single legacy session.
      raw.exec(SCHEMA_SQL);
      // The legacy FK targets executions(id), which is no longer unique in
      // this mixed shape; seed with enforcement off like an odd legacy file.
      raw.exec("PRAGMA foreign_keys = OFF");
      raw.prepare("INSERT INTO works (id, diagnostics) VALUES (?, ?)").run("work:a", "[]");
      raw.prepare("INSERT INTO works (id, diagnostics) VALUES (?, ?)").run("work:b", "[]");
      raw.prepare("INSERT INTO executions (id, work_id, harness) VALUES (?, ?, ?)").run("exec:shared", "work:a", "pi");
      raw.prepare("INSERT INTO executions (id, work_id, harness) VALUES (?, ?, ?)").run("exec:shared", "work:b", "pi");
      raw.exec("DROP TABLE source_sessions");
      raw.exec(`CREATE TABLE source_sessions (
        execution_id TEXT PRIMARY KEY REFERENCES executions(id),
        harness TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_format TEXT,
        source_location TEXT,
        UNIQUE (harness, source_id)
      )`);
      raw.prepare("INSERT INTO source_sessions (execution_id, harness, source_id) VALUES (?, ?, ?)").run(
        "exec:shared",
        "pi",
        "s-shared",
      );
    } finally {
      raw.close();
    }

    const store = initHarnieStore({ home });
    try {
      // Migration runs on first use; the backfill must not duplicate rows.
      expect(loadWork(store, "work:a")?.executions).toHaveLength(1);
      const db = storeDatabase(store);
      const rows = db.prepare("SELECT work_id, execution_id FROM source_sessions ORDER BY work_id").all();
      expect(rows).toEqual([{ work_id: "work:a", execution_id: "exec:shared" }]);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      const versions = (
        db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as unknown as { version: number }[]
      ).map((row) => row.version);
      expect(versions).toContain(1);
    } finally {
      store.close();
    }

    // Re-running the open is stable: still exactly one session row.
    const reopened = initHarnieStore({ home });
    try {
      expect(
        (storeDatabase(reopened).prepare("SELECT COUNT(*) AS n FROM source_sessions").get() as unknown as {
          n: number;
        }).n,
      ).toBe(1);
      expect(loadWork(reopened, "work:a")?.executions[0]?.sourceSession.sourceId).toBe("s-shared");
    } finally {
      reopened.close();
    }
  });

  it("reports the offending table and columns for an unsupported legacy checkpoint shape without touching anything", async () => {
    const home = await makeHome();
    const raw = new DatabaseSync(databasePath(home));
    try {
      legacyCoreDdl(raw);
      raw.prepare("INSERT INTO works (id, diagnostics) VALUES (?, ?)").run("work:old:1", "[]");
      raw.prepare("INSERT INTO executions (id, work_id, harness) VALUES (?, ?, ?)").run(
        "execution:old:1",
        "work:old:1",
        "pi",
      );
      raw.prepare("INSERT INTO source_sessions (execution_id, harness, source_id) VALUES (?, ?, ?)").run(
        "execution:old:1",
        "pi",
        "s-old-1",
      );
      raw.prepare(`INSERT INTO events (id, work_id, execution_id, kind, payload, provenance, diagnostics,
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
      // Legacy-shaped checkpoints (references executions) but with an
      // unexpected column set: goal/decisions/... JSON columns never existed.
      raw.exec(`CREATE TABLE checkpoints (
        id TEXT PRIMARY KEY,
        work_id TEXT NOT NULL REFERENCES works(id),
        execution_id TEXT REFERENCES executions(id),
        message TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`);
      raw.prepare("INSERT INTO checkpoints (id, work_id, execution_id, message, created_at) VALUES (?, ?, ?, ?, ?)").run(
        "checkpoint:old:1",
        "work:old:1",
        "execution:old:1",
        "frozen history",
        "2026-01-03T00:00:00.000Z",
      );
    } finally {
      raw.close();
    }

    const store = initHarnieStore({ home });
    try {
      expect(() => loadWork(store, "work:old:1")).toThrowError(/checkpoints.*missing columns.*operations_json/);
    } finally {
      store.close();
    }

    // Nothing was touched: legacy shapes intact, rows preserved, no versions.
    const check = new DatabaseSync(databasePath(home));
    try {
      const checkpointSql = (
        check.prepare("SELECT sql FROM sqlite_master WHERE name = 'checkpoints'").get() as unknown as { sql: string }
      ).sql;
      expect(checkpointSql).toContain("REFERENCES executions");
      expect(
        (check.prepare("SELECT COUNT(*) AS n FROM checkpoints").get() as unknown as { n: number }).n,
      ).toBe(1);
      const executionsSql = (
        check.prepare("SELECT sql FROM sqlite_master WHERE name = 'executions'").get() as unknown as { sql: string }
      ).sql;
      expect(executionsSql).not.toContain("PRIMARY KEY (work_id");
      expect(check.prepare("SELECT name FROM sqlite_master WHERE name = 'checkpoints_new'").all()).toEqual([]);
      expect(
        (check.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as unknown as { n: number }).n,
      ).toBe(0);
      expect(
        (check.prepare("SELECT COUNT(*) AS n FROM events").get() as unknown as { n: number }).n,
      ).toBe(1);
    } finally {
      check.close();
    }

    // A retry reports the same validation error rather than partial state.
    const retry = initHarnieStore({ home });
    try {
      expect(() => loadWork(retry, "work:old:1")).toThrowError(/Unsupported legacy store shape/);
    } finally {
      retry.close();
    }
  });

  it("reports the offending core table when a legacy events shape is missing columns", async () => {
    const home = await makeHome();
    const raw = new DatabaseSync(databasePath(home));
    try {
      legacyCoreDdl(raw);
      // Unexpected legacy events shape: no provenance_line column.
      raw.exec("ALTER TABLE events DROP COLUMN provenance_line");
      raw.prepare("INSERT INTO works (id, diagnostics) VALUES (?, ?)").run("work:old:1", "[]");
    } finally {
      raw.close();
    }

    const store = initHarnieStore({ home });
    try {
      expect(() => loadWork(store, "work:old:1")).toThrowError(/'events' is missing columns: provenance_line/);
    } finally {
      store.close();
    }
  });

  it("still migrates the supported legacy shapes end to end", async () => {
    const home = await makeHome();
    const raw = new DatabaseSync(databasePath(home));
    try {
      legacyCoreDdl(raw);
      raw.prepare("INSERT INTO works (id, diagnostics) VALUES (?, ?)").run("work:old:1", "[]");
      raw.prepare("INSERT INTO executions (id, work_id, harness) VALUES (?, ?, ?)").run(
        "execution:old:1",
        "work:old:1",
        "pi",
      );
      raw.prepare("INSERT INTO source_sessions (execution_id, harness, source_id) VALUES (?, ?, ?)").run(
        "execution:old:1",
        "pi",
        "s-old-1",
      );
      raw.prepare(`INSERT INTO events (id, work_id, execution_id, kind, payload, provenance, diagnostics,
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
    } finally {
      raw.close();
    }

    const store = initHarnieStore({ home });
    try {
      expect(loadWork(store, "work:old:1")?.events).toHaveLength(1);
      const db = storeDatabase(store);
      expect(
        (db.prepare("SELECT work_id, execution_id FROM source_sessions").all() as unknown as object[]),
      ).toEqual([{ work_id: "work:old:1", execution_id: "execution:old:1" }]);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(
        (db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as unknown as { n: number }).n,
      ).toBe(CURRENT_SCHEMA_VERSION);
    } finally {
      store.close();
    }
  });
});
