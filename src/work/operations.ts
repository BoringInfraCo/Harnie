import { asString, isJsonObject, type JsonValue } from "../types.js";
import type { ToolOperation, ToolOperationStatus, Work, WorkEvent } from "./types.js";

const NOTE_LIMIT = 120;

export const extractToolOperations = (work: Work): ToolOperation[] => {
  const resultsByCallId = indexToolResults(work);
  const operations: ToolOperation[] = [];

  for (const event of work.events) {
    if (event.kind !== "tool_call") continue;

    const toolName = present(asString(event.payload.toolName));
    const path = argumentString(event, "path");
    const command = argumentString(event, "command");
    if (!toolName && !path && !command) continue;

    const toolCallId = asString(event.payload.toolCallId);
    const result = toolCallId ? resultsByCallId.get(toolCallId) : undefined;
    const note = result ? resultNote(result) : undefined;
    const evidence = result ? [event.id, result.id] : [event.id];

    operations.push({
      id: `op:${work.id}:${event.id}`,
      ...(toolName ? { toolName } : {}),
      ...(path ? { path } : {}),
      ...(command ? { command } : {}),
      status: operationStatus(event, result),
      ...(note ? { note } : {}),
      evidence,
      provenance: {
        ...event.provenance,
        observation: "observed",
      },
      rule: "tool-call-arguments",
    });
  }

  return operations;
};

const indexToolResults = (work: Work): Map<string, WorkEvent> => {
  const results = new Map<string, WorkEvent>();
  for (const event of work.events) {
    if (event.kind !== "tool_result") continue;
    const toolCallId = asString(event.payload.toolCallId);
    if (!toolCallId || results.has(toolCallId)) continue;
    results.set(toolCallId, event);
  }
  return results;
};

const operationStatus = (call: WorkEvent, result: WorkEvent | undefined): ToolOperationStatus => {
  if (!result || call.diagnostics.some((diagnostic) => diagnostic.code === "missing_tool_result")) {
    return "pending";
  }
  if (result.payload.isError === true) return "failed";
  return "succeeded";
};

const argumentString = (event: WorkEvent, key: "path" | "command"): string | undefined => {
  if (!isJsonObject(event.payload.arguments)) return undefined;
  return present(asString(event.payload.arguments[key]));
};

const resultNote = (result: WorkEvent): string | undefined => {
  const text = contentText(result.payload.content);
  if (!text) return undefined;
  const lines = text.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) return undefined;
  const preferred = lines.find((line) => line.startsWith("Successfully")) ?? lines[0];
  return preferred ? clip(preferred) : undefined;
};

const contentText = (content: JsonValue | undefined): string => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const blocks: string[] = [];
  for (const block of content) {
    if (!isJsonObject(block) || block.type !== "text") continue;
    if (typeof block.text === "string") blocks.push(block.text);
  }
  return blocks.join("\n");
};

const clip = (text: string): string => (text.length <= NOTE_LIMIT ? text : text.slice(0, NOTE_LIMIT));

const present = (value: string | undefined): string | undefined =>
  value && value.length > 0 ? value : undefined;
