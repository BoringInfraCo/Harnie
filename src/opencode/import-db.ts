import { findOpenCodeDatabase, openCodeDbCandidates } from "../discovery/session-locations.js";
import type { HarnieStore } from "../store/database.js";
import { loadWork, persistObservedWork, type PersistObservedWorkResult } from "../store/persist.js";
import { deriveObservedWork } from "../work/derive.js";
import { attachObservedWork } from "../work/observe.js";
import { redactWork } from "../work/redact.js";
import { observeOpenCodeSession } from "./observe.js";
import { readOpenCodeSqliteFile } from "./reader.js";

export interface ImportOpenCodeSessionFromDbOptions {
  /** Explicit database path; defaults to the first known OpenCode database on disk. */
  readonly dbPath?: string | undefined;
  /** Attach as a new execution of existing Work instead of creating Work. */
  readonly workId?: string | undefined;
  readonly env?: Record<string, string | undefined> | undefined;
}

/**
 * Import a live OpenCode session straight from local session storage.
 *
 * Why this exists alongside snapshot-file import: OpenCode persists live
 * sessions in a SQLite database (session/message/part tables at
 * ~/.local/share/opencode/opencode.db); per-session files do not exist. The
 * Harnie-shaped snapshot JSON accepted by `harnie import opencode <file>` is
 * Harnie's portable export shape, not OpenCode's native storage. This helper
 * bridges the gap by reading the live database read-only through the bundled
 * SQLite reader, then running the same observe/derive/redact/persist flow as
 * a snapshot import.
 */
export const importOpenCodeSessionFromDb = (
  store: HarnieStore,
  sessionId: string,
  options?: ImportOpenCodeSessionFromDbOptions,
): PersistObservedWorkResult => {
  if (sessionId === "") {
    throw new Error("OpenCode session id is required.");
  }
  const dbPath = options?.dbPath ?? findOpenCodeDatabase(options?.env ?? process.env);
  if (dbPath === undefined) {
    const looked = openCodeDbCandidates(options?.env ?? process.env);
    throw new Error(
      `OpenCode database not found. Looked in:\n${looked.map((candidate) => `  - ${candidate}`).join("\n")}\nRun "harnie sessions --harness opencode" to list importable sessions.`,
    );
  }
  const snapshot = readOpenCodeSqliteFile(dbPath, sessionId);
  // Same ingestion choke point as engine/import.ts: nothing reaches SQLite
  // without passing the redaction safety net. Keep in sync with that file.
  const observed = observeOpenCodeSession(snapshot);
  const workId = options?.workId;
  const existing = loadWork(store, workId ?? observed.id);
  if (!existing && workId !== undefined) {
    throw new Error(`Work not found: ${workId}`);
  }
  return persistObservedWork(
    store,
    redactWork(deriveObservedWork(existing ? attachObservedWork(existing, observed) : observed)),
  );
};
