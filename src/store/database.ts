import { mkdirSync } from "node:fs";
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

const openStore = (options: HarnieStoreOptions): OpenStore => {
  const home = resolveHarnieHome(options.home);
  const path = databasePath(home);
  mkdirSync(home, { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
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
