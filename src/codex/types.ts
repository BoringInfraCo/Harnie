import type { Diagnostic, JsonObject } from "../types.js";

export const CODEX_HARNESS = "codex" as const;
export const CODEX_SESSION_FORMAT = "codex-rollout-v1" as const;
export type CodexHarness = "codex";
export type CodexSessionFormat = "codex-rollout-v1";

export interface CodexRolloutRecord {
  readonly type: string;
  readonly timestamp?: string;
  readonly payload: JsonObject;
  readonly line: number;
}

export interface CodexRollout {
  readonly harness: CodexHarness;
  readonly format: CodexSessionFormat;
  readonly sessionId: string;
  readonly cwd?: string;
  readonly model?: string;
  readonly source?: string;
  readonly startedAt?: string;
  readonly records: readonly CodexRolloutRecord[];
  readonly diagnostics: readonly Diagnostic[];
}
