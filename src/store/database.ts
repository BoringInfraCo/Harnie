import { chmodSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { databasePath, resolveHarnieHome } from "./paths.js";
import { SCHEMA_SQL } from "./schema.js";

export { databasePath, HARNIE_HOME_ENV, resolveHarnieHome } from "./paths.js";

export interface HarnieStore {
  readonly home: string;
  readonly databasePath: string;
  close(): void;
}

export interface HarnieStoreOptions {
  readonly home?: string;
}

interface OpenStore extends HarnieStore {
  readonly db: DatabaseSync;
}

export const initHarnieStore = (options: HarnieStoreOptions = {}): HarnieStore =>
  openStore(options);

export const openHarnieStore = (options: HarnieStoreOptions = {}): HarnieStore =>
  openStore(options);

export const storeDatabase = (store: HarnieStore): DatabaseSync => {
  if (!isOpenStore(store)) {
    throw new Error("Harnie store is closed or invalid.");
  }
  return store.db;
};

export const HARNIE_HOME_MODE = 0o700;
export const HARNIE_DB_MODE = 0o600;

const openStore = (options: HarnieStoreOptions): OpenStore => {
  const home = resolveHarnieHome(options.home);
  const path = databasePath(home);
  mkdirSync(home, { recursive: true, mode: HARNIE_HOME_MODE });
  const db = new DatabaseSync(path);
  try {
    enforcePrivatePermissions(home, path);
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec(SCHEMA_SQL);
  } catch (error) {
    db.close();
    throw error;
  }
  return {
    home,
    databasePath: path,
    db,
    close() {
      db.close();
    },
  };
};

const isOpenStore = (store: HarnieStore): store is OpenStore =>
  "db" in store && store.db instanceof DatabaseSync;

// Retained history may hold sensitive session content, so the home directory
// is owner-only (0700) and the SQLite file is owner-read/write (0600).
// Applied on creation and re-enforced (tightened) on every open. chmod is
// best-effort: non-POSIX filesystems may not support modes, and a failure
// must never block opening the store.
const enforcePrivatePermissions = (home: string, dbPath: string): void => {
  tryChmod(home, HARNIE_HOME_MODE);
  tryChmod(dbPath, HARNIE_DB_MODE);
  enforceHandoffArtifactPermissions(home);
};

// Handoff markdown files live under home but are written by CLI code outside
// the store module; tighten them here so every store open converges the whole
// home subtree to private permissions without touching that code.
const enforceHandoffArtifactPermissions = (home: string): void => {
  let directory: string;
  try {
    directory = join(home, "handoffs");
    if (!statSync(directory).isDirectory()) return;
  } catch {
    return;
  }
  tryChmod(directory, HARNIE_HOME_MODE);
  let entries: string[];
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }
  for (const entry of entries) {
    try {
      const path = join(directory, entry);
      if (statSync(path).isFile()) tryChmod(path, HARNIE_DB_MODE);
    } catch {
      // Best effort per file; never fail the open for one artifact.
    }
  }
};

const tryChmod = (path: string, mode: number): void => {
  try {
    chmodSync(path, mode);
  } catch {
    // Ignore: e.g. Windows or read-only mounts without POSIX modes.
  }
};
