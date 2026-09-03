import { reconstructObservedWork } from "../work/observe.js";
import type { ObservedEvent, ObservedWorkInput, Work } from "../work/types.js";
import { normalizeCodexRollout } from "./normalize.js";
import {
  CODEX_HARNESS,
  CODEX_SESSION_FORMAT,
  type CodexRollout,
} from "./types.js";

export const observeCodexSession = (rollout: CodexRollout): Work =>
  reconstructObservedWork(observedWorkInputFromCodex(rollout));

export const observedWorkInputFromCodex = (
  rollout: CodexRollout,
  events: readonly ObservedEvent[] = normalizeCodexRollout(rollout),
): ObservedWorkInput => ({
  harness: CODEX_HARNESS,
  sourceId: rollout.sessionId,
  sourceFormat: CODEX_SESSION_FORMAT,
  ...(rollout.cwd ? { workspacePath: rollout.cwd } : {}),
  ...(rollout.startedAt ? { startedAt: rollout.startedAt } : {}),
  ...(rollout.model ? { model: rollout.model } : {}),
  events,
  diagnostics: rollout.diagnostics,
});
