import { reconstructObservedWork } from "../work/observe.js";
import type { ObservedEvent, ObservedWorkInput, Work } from "../work/types.js";
import { normalizeGrokSession } from "./normalize.js";
import {
  GROK_HARNESS,
  GROK_SESSION_FORMAT,
  type GrokSession,
} from "./types.js";

export const observeGrokSession = (session: GrokSession): Work =>
  reconstructObservedWork(observedWorkInputFromGrok(session));

export const observedWorkInputFromGrok = (
  session: GrokSession,
  events: readonly ObservedEvent[] = normalizeGrokSession(session),
): ObservedWorkInput => ({
  harness: GROK_HARNESS,
  sourceId: session.sessionId,
  sourceFormat: GROK_SESSION_FORMAT,
  ...(session.sourceLocation ? { sourceLocation: session.sourceLocation } : {}),
  ...(session.cwd ? { workspacePath: session.cwd } : {}),
  ...(session.startedAt ? { startedAt: session.startedAt } : {}),
  ...(session.model ? { model: session.model } : {}),
  events,
  diagnostics: session.diagnostics,
});
