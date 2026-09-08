import { chmodSync, existsSync, readdirSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { backupHarnieStore, inspectHarnieStoreFile } from "../src/store/backup.js";
import { initHarnieStore } from "../src/store/database.js";
import { persistObservedWork } from "../src/store/persist.js";
import type { Work } from "../src/work/types.js";

const isPosix = process.platform !== "win32";
const canTestPermissions = isPosix && (typeof process.getuid !== "function" || process.getuid() !== 0);

const homes: string[] = [];
const scratches: string[] = [];

const makeHome = async (): Promise<string> => {
  const home = await mkdtemp(join(tmpdir(), "harnie-fix-backup-"));
  homes.push(home);
  return home;
};

const makeScratch = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), "harnie-fix-backupdest-"));
  scratches.push(dir);
  return dir;
};

const seedWork = (home: string, id: string): void => {
  const store = initHarnieStore({ home });
  try {
    const work: Work = {
      id,
      workspace: { path: "/workspace/backup" },
      executions: [
        {
          id: `execution:${id}`,
          workId: id,
          harness: "pi",
          sourceSession: { harness: "pi", sourceId: `s-${id}` },
        },
      ],
      events: [
        {
          id: `event:${id}:1`,
          workId: id,
          executionId: `execution:${id}`,
          kind: "message",
          payload: { role: "user", content: "fix the bug" },
          provenance: { harness: "pi", line: 1, observation: "observed" },
          diagnostics: [],
        },
      ],
      diagnostics: [],
    };
    persistObservedWork(store, work);
  } finally {
    store.close();
  }
};

const workIdsIn = (path: string): readonly string[] => {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return (db.prepare("SELECT id FROM works ORDER BY id ASC").all() as unknown as { id: string }[]).map(
      (row) => row.id,
    );
  } finally {
    db.close();
  }
};

describe("backup destination atomicity", () => {
  afterEach(async () => {
    await Promise.all([
      ...homes.splice(0).map((home) => rm(home, { recursive: true, force: true })),
      ...scratches.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    ]);
  });

  it("keeps the previous good backup when producing the replacement fails", async () => {
    const home = await makeHome();
    const destDir = await makeScratch();
    const dest = join(destDir, "backup.db");
    seedWork(home, "work:first");
    expect(backupHarnieStore(home, dest)).toBe(dest);
    const firstBackupIds = workIdsIn(dest);
    expect(firstBackupIds).toEqual(["work:first"]);

    // Grow the live store so a successful re-backup would differ.
    seedWork(home, "work:second");

    if (canTestPermissions) {
      // Make the destination directory read-only so VACUUM INTO cannot create
      // its snapshot file; the previous backup must survive untouched.
      chmodSync(destDir, 0o500);
      let failed = false;
      try {
        backupHarnieStore(home, dest);
      } catch {
        failed = true;
      } finally {
        chmodSync(destDir, 0o700);
      }
      expect(failed).toBe(true);
      expect(existsSync(dest)).toBe(true);
      expect(inspectHarnieStoreFile(dest).schemaVersion).toBeGreaterThan(0);
      // The surviving backup is still the previous good copy.
      expect(workIdsIn(dest)).toEqual(firstBackupIds);
      // The failed attempt cleaned up its temp snapshot.
      expect(readdirSync(destDir)).toEqual(["backup.db"]);
    }

    // The live store is unaffected by the failed backup and still works.
    seedWork(home, "work:third");
    expect(backupHarnieStore(home, dest)).toBe(dest);
    expect(workIdsIn(dest)).toEqual(["work:first", "work:second", "work:third"]);
    expect(readdirSync(destDir)).toEqual(["backup.db"]);
    if (canTestPermissions) {
      expect((statSync(dest).mode & 0o777).toString(8)).toBe("600");
    }
  });

  it("round-trips a fresh backup through inspect and read", async () => {
    const home = await makeHome();
    const destDir = await makeScratch();
    const dest = join(destDir, "fresh.db");
    seedWork(home, "work:solo");
    expect(backupHarnieStore(home, dest)).toBe(dest);
    expect(inspectHarnieStoreFile(dest).hasMigrationsTable).toBe(true);
    expect(workIdsIn(dest)).toEqual(["work:solo"]);
    expect(readdirSync(destDir)).toEqual(["fresh.db"]);
    if (isPosix) {
      expect((statSync(dest).mode & 0o777).toString(8)).toBe("600");
    }
  });
});
