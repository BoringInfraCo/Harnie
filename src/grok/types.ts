import type { Diagnostic, JsonObject } from "../types.js";

export const GROK_HARNESS = "grok" as const;
export const GROK_SESSION_FORMAT = "grok-chat-v1" as const;
export type GrokHarness = "grok";
export type GrokSessionFormat = "grok-chat-v1";

/** One parsed line of a Grok chat_history.jsonl transcript. */
export interface GrokChatEntry {
  readonly type: string;
  readonly line: number;
  readonly record: JsonObject;
}

export interface GrokSession {
  readonly harness: GrokHarness;
  readonly format: GrokSessionFormat;
  readonly sessionId: string;
  readonly cwd?: string;
  readonly model?: string;
  readonly startedAt?: string;
  readonly updatedAt?: string;
  /** Directory or chat_history.jsonl file the session was imported from. */
  readonly sourceLocation?: string;
  readonly entries: readonly GrokChatEntry[];
  readonly diagnostics: readonly Diagnostic[];
}
