import { observeCodexSession } from "../codex/observe.js";
import { readCodexJsonlFile } from "../codex/reader.js";
import { observeOpenCodeSession } from "../opencode/observe.js";
import { readOpenCodeSnapshotFile } from "../opencode/reader.js";
import { observePiSession } from "../pi/observe.js";
import { readPiJsonlFile } from "../pi/reader.js";
import type { HarnieStore } from "../store/database.js";
import { persistObservedWork, type PersistObservedWorkResult } from "../store/persist.js";
import { deriveObservedWork } from "../work/derive.js";

export const importPiSessionFile = async (
  store: HarnieStore,
  path: string,
): Promise<PersistObservedWorkResult> => {
  const read = await readPiJsonlFile(path);
  return persistObservedWork(store, deriveObservedWork(observePiSession(read)));
};

export const importOpenCodeSessionFile = async (
  store: HarnieStore,
  path: string,
): Promise<PersistObservedWorkResult> => {
  const snapshot = await readOpenCodeSnapshotFile(path);
  return persistObservedWork(store, deriveObservedWork(observeOpenCodeSession(snapshot)));
};

export const importCodexSessionFile = async (
  store: HarnieStore,
  path: string,
): Promise<PersistObservedWorkResult> => {
  const rollout = await readCodexJsonlFile(path);
  return persistObservedWork(store, deriveObservedWork(observeCodexSession(rollout)));
};
