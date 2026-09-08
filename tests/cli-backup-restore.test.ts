import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { listCheckpoints } from "../src/store/checkpoints.js";
import { databasePath, initHarnieStore, storeDatabase } from "../src/store/database.js";
import { loadWork } from "../src/store/persist.js";
import { listWorks } from "../src/store/query.js";

const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";
const CODEX = "tests/fixtures/codex/unfinished-read.jsonl";
const PI_WORK_ID = "work:pi:harnie-tb-da82c4f8";
const isPosix = process.platform !== "win32";

const capture = () => {
  let output = "";
  return {
    write(chunk: string) {
      output += chunk;
    },
    toString() {
      return output;
    },
  };
};

const childIdFromStdout = (stdout: string): string => {
  const match = stdout.match(/Fork\n(\S+)\n/);
  expect(match?.[1]).toBeDefined();
  return match?.[1] as string;
};

// Seed a store with two executions, events, a checkpoint, and a fork child so
// the round-trip covers works/executions/events/checkpoints/forks.
const seedRichHome = async (home: string): Promise<{ childId: string }> => {
  expect(await runCli(["import", "pi", TRACE_B], { home, stdout: capture(), stderr: capture() })).toBe(0);
  expect(await runCli(["checkpoint", PI_WORK_ID, "pre-backup"], { home, stdout: capture(), stderr: capture() })).toBe(
    0,
  );
  const forkOut = capture();
  expect(await runCli(["fork", PI_WORK_ID, "explore"], { home, stdout: forkOut, stderr: capture() })).toBe(0);
  const childId = childIdFromStdout(forkOut.toString());
  expect(
    await runCli(["import", "codex", CODEX, "--work", childId], { home, stdout: capture(), stderr: capture() }),
  ).toBe(0);
  return { childId };
};

const dumpLogical = (home: string): string => {
  const store = initHarnieStore({ home });
  try {
    const ids = listWorks(store).map((work) => work.id).sort();
    expect(ids.length).toBeGreaterThan(0);
    return JSON.stringify(
      ids.map((id) => ({ work: loadWork(store, id), checkpoints: listCheckpoints(store, id) })),
    );
  } finally {
    store.close();
  }
};

const createLegacyCore = (db: DatabaseSync, workId: string, executionId: string): void => {
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
  db.prepare("INSERT INTO works (id, diagnostics) VALUES (?, ?)").run(workId, "[]");
  db.prepare("INSERT INTO executions (id, work_id, harness) VALUES (?, ?, ?)").run(executionId, workId, "pi");
  db.prepare("INSERT INTO source_sessions (execution_id, harness, source_id) VALUES (?, ?, ?)").run(
    executionId,
    "pi",
    `s-${executionId}`,
  );
  db.prepare(`INSERT INTO events (id, work_id, execution_id, kind, payload, provenance, diagnostics,
    harness, source_session_id, source_event_id, provenance_line, ordinal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    `event:${executionId}`,
    workId,
    executionId,
    "message",
    "{}",
    JSON.stringify({ harness: "pi", line: 1, observation: "observed" }),
    "[]",
    "pi",
    `s-${executionId}`,
    `event:${executionId}`,
    1,
    0,
  );
};

describe("harnie backup/restore", () => {
  const homes: string[] = [];
  const scratch: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-bak-"));
    homes.push(home);
    return home;
  };

  const makeScratch = async (): Promise<string> => {
    const dir = await mkdtemp(join(tmpdir(), "harnie-bakdest-"));
    scratch.push(dir);
    return dir;
  };

  afterEach(async () => {
    await Promise.all([
      ...homes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
      ...scratch.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    ]);
  });

  it("round-trips works/executions/events/checkpoints/forks and leaves the live DB intact", async () => {
    const homeA = await makeHome();
    const homeB = await makeHome();
    const destDir = await makeScratch();
    const dest = join(destDir, "backup.db");
    await seedRichHome(homeA);
    const before = dumpLogical(homeA);

    const backupOut = capture();
    expect(await runCli(["backup", dest], { home: homeA, stdout: backupOut, stderr: capture() })).toBe(0);
    expect(backupOut.toString()).toContain(dest);
    // The live store is untouched by the snapshot and stays fully usable.
    expect(dumpLogical(homeA)).toBe(before);
    // Backing up again onto the same path overwrites cleanly.
    expect(await runCli(["backup", dest], { home: homeA, stdout: capture(), stderr: capture() })).toBe(0);
    if (isPosix) {
      expect((statSync(dest).mode & 0o777).toString(8)).toBe("600");
    }

    const restoreOut = capture();
    expect(await runCli(["restore", dest], { home: homeB, stdout: restoreOut, stderr: capture() })).toBe(0);
    expect(restoreOut.toString()).toContain(databasePath(homeB));
    expect(dumpLogical(homeB)).toBe(before);
  });

  it("refuses to back up onto the live store file", async () => {
    const home = await makeHome();
    await seedRichHome(home);
    const stderr = capture();
    expect(await runCli(["backup", databasePath(home)], { home, stdout: capture(), stderr })).toBe(1);
    expect(stderr.toString()).toMatch(/live store/);
  });

  it("prints usage for backup/restore --help and when paths are missing", async () => {
    const home = await makeHome();
    const backupHelp = capture();
    expect(await runCli(["backup", "--help"], { home, stdout: backupHelp, stderr: capture() })).toBe(0);
    expect(backupHelp.toString()).toMatch(/usage: harnie backup/i);
    const restoreHelp = capture();
    expect(await runCli(["restore", "--help"], { home, stdout: restoreHelp, stderr: capture() })).toBe(0);
    expect(restoreHelp.toString()).toMatch(/usage: harnie restore/i);
    expect(await runCli(["backup"], { home, stdout: capture(), stderr: capture() })).toBe(1);
    expect(await runCli(["restore"], { home, stdout: capture(), stderr: capture() })).toBe(1);
  });

  it("refuses garbage files and leaves the destination untouched", async () => {
    const home = await makeHome();
    const destDir = await makeScratch();
    await seedRichHome(home);
    const liveBytes = await readFile(databasePath(home));
    const garbage = join(destDir, "garbage.db");
    await writeFile(garbage, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));

    const stderr = capture();
    expect(await runCli(["restore", garbage], { home, stdout: capture(), stderr })).toBe(1);
    expect(stderr.toString()).toMatch(/Not a Harnie store/);
    expect(await readFile(databasePath(home))).toEqual(liveBytes);
  });

  it("recovers a corrupted destination from a valid backup", async () => {
    const homeA = await makeHome();
    const homeB = await makeHome();
    const destDir = await makeScratch();
    await seedRichHome(homeA);
    const dest = join(destDir, "backup.db");
    expect(await runCli(["backup", dest], { home: homeA, stdout: capture(), stderr: capture() })).toBe(0);
    await writeFile(databasePath(homeB), "corrupted-by-hand");

    expect(await runCli(["restore", dest], { home: homeB, stdout: capture(), stderr: capture() })).toBe(0);
    expect(dumpLogical(homeB)).toBe(dumpLogical(homeA));
  });

  it("refuses to overwrite a newer store without --force and migrates with it", async () => {
    const legacyHome = await makeHome();
    const currentHome = await makeHome();
    const destDir = await makeScratch();
    // Legacy backup: old core shape with no migrations table (schema version 0).
    const raw = new DatabaseSync(databasePath(legacyHome));
    try {
      createLegacyCore(raw, "work:old:restore", "execution:old:restore");
    } finally {
      raw.close();
    }
    const backupPath = join(destDir, "legacy.db");
    expect(await runCli(["backup", backupPath], { home: legacyHome, stdout: capture(), stderr: capture() })).toBe(0);
    // Newer destination: current schema (version stamped on first read).
    await seedRichHome(currentHome);

    const refused = capture();
    expect(await runCli(["restore", backupPath], { home: currentHome, stdout: capture(), stderr: refused })).toBe(1);
    expect(refused.toString()).toMatch(/newer store/);
    expect(refused.toString()).toMatch(/--force/);
    // The refused restore left the newer store fully intact.
    expect(loadWorkCount(currentHome)).toBeGreaterThan(1);

    expect(
      await runCli(["restore", backupPath, "--force"], { home: currentHome, stdout: capture(), stderr: capture() }),
    ).toBe(0);
    // Restore-then-open runs the pending migrations forward.
    const store = initHarnieStore({ home: currentHome });
    try {
      expect(loadWork(store, "work:old:restore")?.events).toHaveLength(1);
      const sql = (
        storeDatabase(store).prepare("SELECT sql FROM sqlite_master WHERE name = 'executions'").get() as unknown as {
          sql: string;
        }
      ).sql;
      expect(sql).toContain("PRIMARY KEY (work_id");
    } finally {
      store.close();
    }
  });

  it("refuses backups from a newer-than-supported schema version", async () => {
    const futureHome = await makeHome();
    const home = await makeHome();
    const destDir = await makeScratch();
    await seedRichHome(home);
    const liveBytes = await readFile(databasePath(home));
    const raw = new DatabaseSync(databasePath(futureHome));
    try {
      createLegacyCore(raw, "work:future:1", "execution:future:1");
      raw.exec("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)");
      raw.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(9999, "2026-09-07T00:00:00.000Z");
    } finally {
      raw.close();
    }

    const stderr = capture();
    expect(
      await runCli(["restore", databasePath(futureHome)], { home, stdout: capture(), stderr }),
    ).toBe(1);
    expect(stderr.toString()).toMatch(/Unsupported.*schema version 9999/);
    expect(await readFile(databasePath(home))).toEqual(liveBytes);
  });

  it("reports a missing backup file without touching the destination", async () => {
    const home = await makeHome();
    await seedRichHome(home);
    const liveBytes = await readFile(databasePath(home));
    const stderr = capture();
    expect(
      await runCli(["restore", join(home, "does-not-exist.db")], { home, stdout: capture(), stderr }),
    ).toBe(1);
    expect(stderr.toString()).toMatch(/Backup not found/);
    expect(await readFile(databasePath(home))).toEqual(liveBytes);
  });
});

const loadWorkCount = (home: string): number => {
  const store = initHarnieStore({ home });
  try {
    return listWorks(store).length;
  } finally {
    store.close();
  }
};
