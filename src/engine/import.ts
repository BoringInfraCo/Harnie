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
