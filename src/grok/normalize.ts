import { asString, isJsonObject, type JsonObject, type JsonValue } from "../types.js";
import type { ObservedEvent, Provenance } from "../work/types.js";
import {
  GROK_HARNESS,
  GROK_SESSION_FORMAT,
  type GrokChatEntry,
  type GrokSession,
} from "./types.js";

const OUTPUT_LIMIT = 200;
const USER_QUERY_PATTERN = /<user_query>([\s\S]*?)<\/user_query>/gu;
/**
 * Context/instruction wrappers Grok injects into a user turn. Their contents
 * are environment or policy boilerplate, never the human's request, so they
 * are stripped before deciding whether an untagged entry is real speech.
 * `<rules>` is the outer wrapper for workspace/memory/user rules; its nested
 * blocks (`user_rules`, `user_rule`, `always_applied_workspace_rules`) close
 * with their own tag names, so a non-greedy `<rules>...</rules>` matches the
 * outer close correctly.
 */
const CONTEXT_WRAPPER_TAGS = [
  "user_info",
  "git_status",
  "system-reminder",
  "rules",
  "user_rules",
  "user_rule",
  "always_applied_workspace_rules",
  "agent_requested_rules",
] as const;
const UNCLOSED_SYSTEM_REMINDER_PATTERN = /<system-reminder>[\s\S]*$/u;
const stripContextWrappers = (text: string): string => {
  let remainder = text;
  for (const tag of CONTEXT_WRAPPER_TAGS) {
    const paired = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, "gu");
    remainder = remainder.replace(paired, "");
  }
  return remainder.replace(UNCLOSED_SYSTEM_REMINDER_PATTERN, "");
};

/** Argument keys that name the file or directory a Grok tool operates on. */
const PATH_KEYS = ["target_file", "file_path", "target_directory", "path", "filePath"] as const;
/** Argument keys that carry the shell command a Grok tool runs. */
const COMMAND_KEYS = ["command", "cmd"] as const;

export const normalizeGrokSession = (session: GrokSession): readonly ObservedEvent[] => {
  const events: ObservedEvent[] = [];
  for (const entry of session.entries) {
    events.push(...normalizeEntry(session.sessionId, entry));
  }
  return events;
};

const normalizeEntry = (sessionId: string, entry: GrokChatEntry): readonly ObservedEvent[] => {
  const record = entry.record;
  if (entry.type === "user") {
    const speech = userSpeechText(record.content);
    if (speech !== "") {
      return [observedEvent(sessionId, entry, "message", "user", { role: "user", content: speech })];
    }
    // Environment injections (<user_info>/<git_status>) and system reminders
    // are context, not user speech: kept as unknown evidence so goal
    // derivation (first user message) lands on the first real prompt.
    return [observedEvent(sessionId, entry, "unknown", "user_context", { sourceType: "user_context" })];
  }

  if (entry.type === "assistant") {
    const events: ObservedEvent[] = [];
    const content = asString(record.content)?.trim() ?? "";
    if (content !== "") {
      events.push(
        observedEvent(sessionId, entry, "message", "assistant", { role: "assistant", content }),
      );
    }
    for (const [index, call] of toolCalls(record).entries()) {
      const toolCallId = asString(call.id);
      const toolName = asString(call.name);
      events.push(toolCallEvent(sessionId, entry, index, toolCallId, toolName, toolArguments(call.arguments)));
    }
    return events;
  }

  if (entry.type === "tool_result") {
    const toolCallId = asString(record.tool_call_id);
    const content = resultContent(record.content);
    const isError = content.trimStart().startsWith("Error:");
    return [
      observedEvent(sessionId, entry, "tool_result", "tool_result", {
        ...(toolCallId ? { toolCallId } : {}),
        content,
        isError,
      }, toolCallId),
    ];
  }

  // The static system prompt is session boilerplate, not observed work.
  if (entry.type === "system") return [];

  // Typed reasoning (and backend telemetry such as web-search calls) never
  // becomes decisions or operations, mirroring the codex adapter.
  if (entry.type === "reasoning" || entry.type === "backend_tool_call") {
    return [observedEvent(sessionId, entry, "unknown", entry.type, { sourceType: entry.type })];
  }

  return [observedEvent(sessionId, entry, "unknown", entry.type, { sourceType: entry.type })];
};

/**
 * Real user speech in a Grok transcript is usually wrapped in
 * `<user_query>...</user_query>`. Subagent/non-interactive runs sometimes put
 * the genuine first prompt in a plain untagged block, so when no query wrapper
 * is present the known context/reminder wrappers are stripped and any
 * remaining text is treated as speech. Entries that are pure context
 * (`<user_info>`/`<git_status>`/`<system-reminder>`/`<rules>` and their nested
 * rule blocks) yield an empty string.
 */
const userSpeechText = (content: JsonValue | undefined): string => {
  const text = blockText(content);
  if (text === "") return "";

  const queries: string[] = [];
  USER_QUERY_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(USER_QUERY_PATTERN)) {
    const inner = match[1]?.trim() ?? "";
    if (inner !== "") queries.push(inner);
  }
  if (queries.length > 0) return queries.join("\n");

  return stripContextWrappers(text).trim();
};

const blockText = (content: JsonValue | undefined): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!isJsonObject(block) || block.type !== "text") continue;
    const text = asString(block.text);
    if (text) parts.push(text);
  }
  return parts.join("");
};

const toolCalls = (record: JsonObject): readonly JsonObject[] => {
  const calls = record.tool_calls;
  if (!Array.isArray(calls)) return [];
  return calls.filter((call): call is JsonObject => isJsonObject(call));
};

/**
 * Grok tool arguments arrive as a JSON-encoded string. Only the operated-on
 * path and the executed command are kept: full argument payloads can embed
 * whole file contents (e.g. search_replace new_string) that would bloat the
 * store.
 */
const toolArguments = (value: JsonValue | undefined): JsonObject => {
  const parsed = parseObject(value);
  const args: JsonObject = {};
  for (const key of PATH_KEYS) {
    const path = asString(parsed[key]);
    if (path) {
      args.path = path;
      break;
    }
  }
  for (const key of COMMAND_KEYS) {
    const command = asString(parsed[key]);
    if (command) {
      args.command = command;
      break;
    }
  }
  return args;
};

const parseObject = (value: JsonValue | undefined): JsonObject => {
  if (isJsonObject(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value) as JsonValue;
    return isJsonObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const resultContent = (content: JsonValue | undefined): string => {
  const text = blockText(content);
  if (text.length === 0) return "completed";
  return text.length > OUTPUT_LIMIT ? text.slice(0, OUTPUT_LIMIT) : text;
};

const toolCallEvent = (
  sessionId: string,
  entry: GrokChatEntry,
  index: number,
  toolCallId: string | undefined,
  toolName: string | undefined,
  args: JsonObject,
): ObservedEvent => {
  const suffix = toolCallId ?? String(index);
  return {
    id: `${GROK_HARNESS}:${sessionId}:${entry.line}:tool_call:${suffix}`,
    kind: "tool_call",
    payload: {
      ...(toolCallId ? { toolCallId } : {}),
      ...(toolName ? { toolName } : {}),
      arguments: args,
    },
    provenance: provenance(sessionId, entry, "tool_call", toolCallId),
    diagnostics: [],
  };
};

const observedEvent = (
  sessionId: string,
  entry: GrokChatEntry,
  kind: ObservedEvent["kind"],
  sourceType: string,
  payload: JsonObject,
  toolCallId?: string,
): ObservedEvent => ({
  id: `${GROK_HARNESS}:${sessionId}:${entry.line}:${kind}`,
  kind,
  payload,
  provenance: provenance(sessionId, entry, sourceType, toolCallId),
  diagnostics: [],
});

const provenance = (
  sessionId: string,
  entry: GrokChatEntry,
  sourceType: string,
  toolCallId?: string,
): Provenance => ({
  harness: GROK_HARNESS,
  sourceFormat: GROK_SESSION_FORMAT,
  sourceSession: sessionId,
  sourceType,
  ...(toolCallId ? { sourceEntry: toolCallId, toolCallId } : {}),
  line: entry.line,
  observation: "observed",
});
