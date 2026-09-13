import { observeCodexSession } from "../codex/observe.js";
import { readCodexJsonlFile } from "../codex/reader.js";
import { observeGrokSession } from "../grok/observe.js";
import { readGrokSessionPath } from "../grok/reader.js";
import { observeOpenCodeSession } from "../opencode/observe.js";
import { readOpenCodeSnapshotFile } from "../opencode/reader.js";
import { observePiSession } from "../pi/observe.js";
import { readPiJsonlFile } from "../pi/reader.js";
import type { HarnieStore } from "../store/database.js";
import { loadWork, persistObservedWork, type PersistObservedWorkResult } from "../store/persist.js";
import { deriveObservedWork } from "../work/derive.js";
import { attachObservedWork } from "../work/observe.js";
import { redactWork } from "../work/redact.js";
import type { Work } from "../work/types.js";

export interface ImportSessionOptions {
  readonly workId?: string | undefined;
}

export const importPiSessionFile = async (
  store: HarnieStore,
  path: string,
  options?: ImportSessionOptions,
): Promise<PersistObservedWorkResult> => {
  const read = await readPiJsonlFile(path);
  return persistWithOptionalAttach(store, observePiSession(read), options?.workId);
};

export const importOpenCodeSessionFile = async (
  store: HarnieStore,
  path: string,
  options?: ImportSessionOptions,
): Promise<PersistObservedWorkResult> => {
  const snapshot = await readOpenCodeSnapshotFile(path);
  return persistWithOptionalAttach(store, observeOpenCodeSession(snapshot), options?.workId);
};

export const importCodexSessionFile = async (
  store: HarnieStore,
  path: string,
  options?: ImportSessionOptions,
): Promise<PersistObservedWorkResult> => {
  const rollout = await readCodexJsonlFile(path);
  return persistWithOptionalAttach(store, observeCodexSession(rollout), options?.workId);
};

export const importGrokSessionPath = async (
  store: HarnieStore,
  path: string,
  options?: ImportSessionOptions,
): Promise<PersistObservedWorkResult> => {
  const session = await readGrokSessionPath(path);
  return persistWithOptionalAttach(store, observeGrokSession(session), options?.workId);
};

const persistWithOptionalAttach = (
  store: HarnieStore,
  observed: Work,
  workId: string | undefined,
): PersistObservedWorkResult => {
  const existing = loadWork(store, workId ?? observed.id);
  if (!existing && workId !== undefined) {
    throw new Error(`Work not found: ${workId}`);
  }
  // Final ingestion choke point: nothing reaches SQLite without passing the
  // redaction safety net (idempotent when observe/derive already redacted).
  // Covers fresh imports and attach/refresh merges alike.
  return persistObservedWork(store, redactWork(deriveObservedWork(existing ? attachObservedWork(existing, observed) : observed)));
};
