import { chmodSync, copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { databasePath, HARNIE_DB_MODE, HARNIE_HOME_MODE, initHarnieStore, resolveHarnieHome, storeDatabase } from "./database.js";
import { CURRENT_SCHEMA_VERSION } from "./schema.js";

export interface StoreIdentity {
  readonly schemaVersion: number;
  readonly hasMigrationsTable: boolean;
}

export interface RestoreOptions {
  readonly force?: boolean;
}

const REQUIRED_TABLES = ["works", "executions", "source_sessions", "events"] as const;

// Consistent snapshot of the live store via SQLite `VACUUM INTO`, which reads
// transactionally and never modifies the source database. The live store stays
// open (and usable) for the whole operation; only the backup file is written.
// The snapshot goes to a temp file in the destination's directory and is
// renamed over the destination only on success, so the previous good backup
// survives any failure.
export const backupHarnieStore = (home: string, destPath: string): string => {
  const resolvedHome = resolveHarnieHome(home);
  const dest = resolve(destPath);
  const live = resolve(databasePath(resolvedHome));
  if (dest === live) {
    throw new Error(`Refusing to back up onto the live store: ${dest}`);
  }
  const store = initHarnieStore({ home: resolvedHome });
  const tmp = `${dest}.backup-${process.pid}.tmp`;
  try {
    mkdirSync(dirname(dest), { recursive: true });
    // VACUUM INTO requires a fresh path; clear only our own temp target.
    rmSync(tmp, { force: true });
    storeDatabase(store).exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    try {
      chmodSync(tmp, HARNIE_DB_MODE);
    } catch {
      // Best effort: non-POSIX filesystems may not support modes.
    }
    renameSync(tmp, dest);
    try {
      chmodSync(dest, HARNIE_DB_MODE);
    } catch {
      // Best effort: non-POSIX filesystems may not support modes.
    }
  } catch (error) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // Best effort cleanup; the destination is untouched either way.
    }
    throw error;
  } finally {
    store.close();
  }
  return dest;
};

// Validate that a file is a Harnie store (read-only; never mutates it) and
// report its schema version. Legacy stores without a migrations table report
// version 0; restore-then-open migrates them forward.
export const inspectHarnieStoreFile = (path: string): StoreIdentity => {
  let db: DatabaseSync;
  try {
    db = new DatabaseSync(path, { readOnly: true });
  } catch (error) {
    throw new Error(`Not a Harnie store: ${path} (${describeError(error)})`);
  }
  try {
    let names: Set<string>;
    try {
      names = new Set(
        (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as unknown as { name: string }[]).map(
          (row) => row.name,
        ),
      );
    } catch (error) {
      throw new Error(`Not a Harnie store: ${path} (${describeError(error)})`);
    }
    const missing = REQUIRED_TABLES.filter((table) => !names.has(table));
    if (missing.length > 0) {
      throw new Error(`Not a Harnie store: ${path} (missing tables: ${missing.join(", ")})`);
    }
    let version = 0;
    let hasMigrationsTable = false;
    if (names.has("schema_migrations")) {
      hasMigrationsTable = true;
      try {
        const row = db.prepare("SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations").get() as unknown as {
          v: number;
        };
        version = Number(row.v);
      } catch (error) {
        throw new Error(`Not a Harnie store: ${path} (unreadable schema version: ${describeError(error)})`);
      }
    }
    if (!Number.isInteger(version) || version < 0) {
      throw new Error(`Not a Harnie store: ${path} (invalid schema version)`);
    }
    if (version > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `Unsupported Harnie store schema version ${version} (this CLI supports up to version ${CURRENT_SCHEMA_VERSION}): ${path}`,
      );
    }
    return { schemaVersion: version, hasMigrationsTable };
  } finally {
    db.close();
  }
};

// Replace the live store with a validated backup copy. The source is fully
// validated before the destination is touched; a newer destination store is
// only overwritten with { force: true }. The copy is written to a temp file
// and renamed so a failed restore never leaves a half-written live database.
// Opening the restored store afterwards runs pending migrations forward.
export const restoreHarnieStore = (home: string, srcPath: string, options: RestoreOptions = {}): string => {
  const resolvedHome = resolveHarnieHome(home);
  const src = resolve(srcPath);
  if (!existsSync(src) || !statSync(src).isFile()) {
    throw new Error(`Backup not found: ${srcPath}`);
  }
  const live = resolve(databasePath(resolvedHome));
  if (src === live) {
    throw new Error(`Refusing to restore the live store onto itself: ${src}`);
  }
  const srcIdentity = inspectHarnieStoreFile(src);
  if (existsSync(live)) {
    const destVersion = readStoreVersionIfValid(live);
    if (destVersion !== undefined && destVersion > srcIdentity.schemaVersion && options.force !== true) {
      throw new Error(
        `Refusing to overwrite newer store (schema version ${destVersion}) with older backup (schema version ${srcIdentity.schemaVersion}); pass --force to downgrade: ${src}`,
      );
    }
  }
  mkdirSync(resolvedHome, { recursive: true, mode: HARNIE_HOME_MODE });
  const tmp = `${live}.restore-${process.pid}.tmp`;
  copyFileSync(src, tmp);
  try {
    renameSync(tmp, live);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    try {
      rmSync(`${live}${suffix}`, { force: true });
    } catch {
      // Best effort cleanup of stale sidecars.
    }
  }
  const store = initHarnieStore({ home: resolvedHome });
  store.close();
  return live;
};

const readStoreVersionIfValid = (path: string): number | undefined => {
  try {
    return inspectHarnieStoreFile(path).schemaVersion;
  } catch {
    // An unreadable destination means there is nothing newer to protect;
    // overwriting it with a valid backup is the recovery path.
    return undefined;
  }
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
