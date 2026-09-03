import { asString, isJsonObject, type JsonObject } from "../types.js";
import type { ObservedEvent, Provenance } from "../work/types.js";
import {
  OPENCODE_HARNESS,
  OPENCODE_SESSION_FORMAT,
  type OpenCodeMessageRecord,
  type OpenCodePartRecord,
  type OpenCodeSessionSnapshot,
  type OpenCodeToolInput,
} from "./types.js";

const EPOCH_MS_MIN = 1_000_000_000_000;
const SPEAKING_ROLES = new Set(["user", "assistant"]);
const TOOL_RESULT_STATUSES = new Set(["completed", "error"]);

export const normalizeOpenCodeSnapshot = (
  snapshot: OpenCodeSessionSnapshot,
): readonly ObservedEvent[] => {
  const sessionId = snapshot.session.id;
  const messages = [...snapshot.messages].sort(compareByTimeThenId);
  const partsByMessage = indexPartsByMessage(snapshot.parts);
  const events: ObservedEvent[] = [];

  for (const message of messages) {
    const parts = partsByMessage.get(message.id) ?? [];
    parts.forEach((part, index) => {
      events.push(...normalizePart(sessionId, message, part, index + 1));
    });
  }

  return events;
};

export const isoFromEpochMs = (value: number): string | undefined =>
  Number.isFinite(value) && value >= EPOCH_MS_MIN ? new Date(value).toISOString() : undefined;

const indexPartsByMessage = (
  parts: readonly OpenCodePartRecord[],
): Map<string, OpenCodePartRecord[]> => {
  const grouped = new Map<string, OpenCodePartRecord[]>();
  for (const part of [...parts].sort(compareByTimeThenId)) {
    const list = grouped.get(part.message_id);
    if (list) list.push(part);
    else grouped.set(part.message_id, [part]);
  }
  return grouped;
};

const normalizePart = (
  sessionId: string,
  message: OpenCodeMessageRecord,
  part: OpenCodePartRecord,
  line: number,
): readonly ObservedEvent[] => {
  const type = part.data.type;
  const timestamp = isoFromEpochMs(part.time_created);

  if (type === "text") {
    if (!SPEAKING_ROLES.has(message.data.role)) return [];
    const content = part.data.text;
    if (typeof content !== "string" || content.trim() === "") return [];
    return [observedEvent(sessionId, part, "message", line, timestamp, {
      role: message.data.role,
      content,
    })];
  }

  if (type === "tool") {
    return normalizeToolPart(sessionId, part, line, timestamp);
  }

  return [observedEvent(sessionId, part, "unknown", line, timestamp, { sourceType: type })];
};

const normalizeToolPart = (
  sessionId: string,
  part: OpenCodePartRecord,
  line: number,
  timestamp: string | undefined,
): readonly ObservedEvent[] => {
  const callID = part.data.callID;
  const toolName = part.data.tool;
  const status = part.data.state?.status;
  const events: ObservedEvent[] = [
    observedEvent(sessionId, part, "tool_call", line, timestamp, {
      ...(callID ? { toolCallId: callID } : {}),
      ...(toolName ? { toolName } : {}),
      arguments: toolArguments(part.data.state?.input),
    }, callID),
  ];

  if (status !== undefined && TOOL_RESULT_STATUSES.has(status)) {
    events.push(observedEvent(sessionId, part, "tool_result", line, timestamp, {
      ...(callID ? { toolCallId: callID } : {}),
      ...(toolName ? { toolName } : {}),
      isError: status === "error",
      content: status === "error" ? "error" : "completed",
    }, callID));
  }

  return events;
};

const toolArguments = (input: OpenCodeToolInput | undefined): JsonObject => {
  const record = isJsonObject(input) ? input : {};
  const path = asString(record.filePath) ?? asString(record.path);
  const command = asString(record.command);
  const pattern = asString(record.pattern);
  return {
    ...(path ? { path } : {}),
    ...(command ? { command } : {}),
    ...(pattern ? { pattern } : {}),
  };
};

const observedEvent = (
  sessionId: string,
  part: OpenCodePartRecord,
  kind: ObservedEvent["kind"],
  line: number,
  timestamp: string | undefined,
  payload: JsonObject,
  toolCallId?: string,
): ObservedEvent => ({
  id: `${OPENCODE_HARNESS}:${sessionId}:${part.id}:${kind}`,
  kind,
  ...(timestamp ? { timestamp } : {}),
  payload,
  provenance: provenance(sessionId, part, line, toolCallId),
  diagnostics: [],
});

const provenance = (
  sessionId: string,
  part: OpenCodePartRecord,
  line: number,
  toolCallId?: string,
): Provenance => ({
  harness: OPENCODE_HARNESS,
  sourceFormat: OPENCODE_SESSION_FORMAT,
  sourceSession: sessionId,
  sourceType: part.data.type,
  sourceEntry: part.id,
  line,
  ...(toolCallId ? { toolCallId } : {}),
  observation: "observed",
});

const compareByTimeThenId = (
  a: { readonly id: string; readonly time_created: number },
  b: { readonly id: string; readonly time_created: number },
): number => {
  if (a.time_created !== b.time_created) return a.time_created - b.time_created;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
};
