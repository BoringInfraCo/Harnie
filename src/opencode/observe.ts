import { reconstructObservedWork } from "../work/observe.js";
import type { ObservedEvent, ObservedWorkInput, Work } from "../work/types.js";
import { isoFromEpochMs, normalizeOpenCodeSnapshot } from "./normalize.js";
import {
  OPENCODE_HARNESS,
  OPENCODE_SESSION_FORMAT,
  type OpenCodeSessionSnapshot,
} from "./types.js";

export const observeOpenCodeSession = (snapshot: OpenCodeSessionSnapshot): Work =>
  reconstructObservedWork(observedWorkInputFromOpenCode(snapshot));

export const observedWorkInputFromOpenCode = (
  snapshot: OpenCodeSessionSnapshot,
  events: readonly ObservedEvent[] = normalizeOpenCodeSnapshot(snapshot),
): ObservedWorkInput => {
  const session = snapshot.session;
  const startedAt = isoFromEpochMs(session.time_created);
  const model = session.model;

  return {
    harness: OPENCODE_HARNESS,
    sourceId: session.id,
    sourceFormat: OPENCODE_SESSION_FORMAT,
    workspacePath: session.directory,
    ...(startedAt ? { startedAt } : {}),
    ...(model ? { provider: model.providerID, model: model.id } : {}),
    events,
  };
};
