import { asString, isJsonObject, type JsonObject, type JsonValue } from "../types.js";
import type { ObservedEvent, Provenance } from "../work/types.js";
import {
  CODEX_HARNESS,
  CODEX_SESSION_FORMAT,
  type CodexRollout,
  type CodexRolloutRecord,
} from "./types.js";

const SPEAKING_ROLES = new Set(["user", "assistant"]);
const VISIBLE_TEXT_TYPES = new Set(["input_text", "output_text", "text"]);
const HIDDEN_TEXT_TYPES = new Set(["reasoning", "thinking", "encrypted_content"]);
const OUTPUT_LIMIT = 200;
const PATCH_FILE = /^\*\*\* (?:Update|Add|Delete) File:\s*(.+)$/m;
const PATCH_BEGIN = "*** Begin Patch";

export const normalizeCodexRollout = (rollout: CodexRollout): readonly ObservedEvent[] => {
  const events: ObservedEvent[] = [];

  for (const record of rollout.records) {
    if (record.type !== "response_item") continue;
    const event = normalizeResponseItem(rollout.sessionId, record);
    if (event) events.push(event);
  }

  return events;
};

const normalizeResponseItem = (
  sessionId: string,
  record: CodexRolloutRecord,
): ObservedEvent | undefined => {
  const payload = record.payload;
  const sourceType = asString(payload.type) ?? record.type;

  if (sourceType === "message") {
    const role = asString(payload.role);
    if (!role || !SPEAKING_ROLES.has(role)) return undefined;
    const content = visibleText(payload.content);
    if (content.trim() === "") return undefined;
    return observedEvent(sessionId, record, "message", sourceType, { role, content });
  }

  if (sourceType === "function_call") {
    return toolCallEvent(sessionId, record, sourceType, asString(payload.name), mapCmdAndPath(parseObject(payload.arguments)));
  }

  if (sourceType === "function_call_output") {
    return toolResultEvent(sessionId, record, sourceType, payload);
  }

  if (sourceType === "custom_tool_call") {
    return toolCallEvent(
      sessionId,
      record,
      sourceType,
      asString(payload.name),
      customToolArguments(asString(payload.name), payload.input),
    );
  }

  if (sourceType === "custom_tool_call_output") {
    return toolResultEvent(sessionId, record, sourceType, payload);
  }

  if (sourceType === "reasoning") {
    return observedEvent(sessionId, record, "unknown", sourceType, { sourceType: "reasoning" });
  }

  return observedEvent(sessionId, record, "unknown", sourceType, { sourceType });
};

const toolCallEvent = (
  sessionId: string,
  record: CodexRolloutRecord,
  sourceType: string,
  toolName: string | undefined,
  args: JsonObject,
): ObservedEvent => {
  const toolCallId = callId(record.payload);
  return observedEvent(sessionId, record, "tool_call", sourceType, {
    ...(toolCallId ? { toolCallId } : {}),
    ...(toolName ? { toolName } : {}),
    arguments: args,
  }, toolCallId);
};

const toolResultEvent = (
  sessionId: string,
  record: CodexRolloutRecord,
  sourceType: string,
  payload: JsonObject,
): ObservedEvent => {
  const toolCallId = callId(payload);
  const isError = payload.success === false || asString(payload.status) === "error";
  return observedEvent(sessionId, record, "tool_result", sourceType, {
    ...(toolCallId ? { toolCallId } : {}),
    content: resultContent(payload.output, isError),
    isError,
  }, toolCallId);
};

const customToolArguments = (name: string | undefined, input: JsonValue | undefined): JsonObject => {
  if (typeof input === "string") {
    if (name === "apply_patch" || input.startsWith(PATCH_BEGIN)) {
      const path = firstPatchPath(input);
      return path ? { path } : {};
    }
    if (name === "exec" || name === "exec_command") {
      return { command: input };
    }
    return {};
  }
  if (isJsonObject(input)) return mapCmdAndPath(input);
  return {};
};

const mapCmdAndPath = (value: JsonObject): JsonObject => {
  const mapped: JsonObject = {};
  for (const [key, field] of Object.entries(value)) {
    if (key === "cmd" || key === "workdir" || key === "filePath") continue;
    mapped[key] = field;
  }
  const command = asString(value.command) ?? asString(value.cmd);
  const path = asString(value.path) ?? asString(value.filePath);
  if (command) mapped.command = command;
  if (path) mapped.path = path;
  return mapped;
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

const firstPatchPath = (input: string): string | undefined => {
  const match = PATCH_FILE.exec(input);
  const path = match?.[1]?.trim();
  return path && path.length > 0 ? path : undefined;
};

const visibleText = (content: JsonValue | undefined): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!isJsonObject(block)) continue;
    const type = asString(block.type);
    if (type === undefined || HIDDEN_TEXT_TYPES.has(type) || !VISIBLE_TEXT_TYPES.has(type)) continue;
    const text = asString(block.text);
    if (text) parts.push(text);
  }
  return parts.join("");
};

const resultContent = (output: JsonValue | undefined, isError: boolean): string => {
  let text: string | undefined;
  if (typeof output === "string") text = output;
  else if (isJsonObject(output)) text = asString(output.body) ?? asString(output.text);
  if (!text || text.length === 0) return isError ? "error" : "completed";
  return text.length > OUTPUT_LIMIT ? text.slice(0, OUTPUT_LIMIT) : text;
};

const callId = (payload: JsonObject): string | undefined =>
  asString(payload.call_id) ?? asString(payload.id);

const observedEvent = (
  sessionId: string,
  record: CodexRolloutRecord,
  kind: ObservedEvent["kind"],
  sourceType: string,
  payload: JsonObject,
  toolCallId?: string,
): ObservedEvent => ({
  id: `${CODEX_HARNESS}:${sessionId}:${record.line}:${kind}`,
  kind,
  ...(record.timestamp ? { timestamp: record.timestamp } : {}),
  payload,
  provenance: provenance(sessionId, record, sourceType, toolCallId),
  diagnostics: [],
});

const provenance = (
  sessionId: string,
  record: CodexRolloutRecord,
  sourceType: string,
  toolCallId?: string,
): Provenance => ({
  harness: CODEX_HARNESS,
  sourceFormat: CODEX_SESSION_FORMAT,
  sourceSession: sessionId,
  sourceType,
  ...(toolCallId ? { sourceEntry: toolCallId, toolCallId } : {}),
  line: record.line,
  observation: "observed",
});
