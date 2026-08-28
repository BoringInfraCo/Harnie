import { diagnostic } from "./diagnostics.js";
import type { Diagnostic, JsonObject, NormalizedEvent, SourceProvenance, SourceRecord } from "../types.js";
import { asString, isJsonObject } from "../types.js";

export interface NormalizePiOptions {
  readonly diagnostics?: readonly Diagnostic[];
}

export const normalizePiRecords = (
  records: readonly SourceRecord[],
  options: NormalizePiOptions = {},
): readonly NormalizedEvent[] => {
  const extraDiagnostics = options.diagnostics ?? [];
  const events: NormalizedEvent[] = [];

  for (const record of records) {
    if (isHeader(record)) continue;

    const diagnostics = diagnosticsForRecord(record, extraDiagnostics);

    if (record.sourceType === "message" && isJsonObject(record.raw.message)) {
      events.push(...normalizeMessageRecord(record, diagnostics));
      continue;
    }

    events.push(unknownEvent(record, diagnostics));
  }

  return events;
};

const normalizeMessageRecord = (
  record: SourceRecord,
  diagnostics: readonly Diagnostic[],
): readonly NormalizedEvent[] => {
  const message = record.raw.message as JsonObject;
  const role = asString(message.role);

  if (role === "assistant") {
    const events: NormalizedEvent[] = [];
    const content = Array.isArray(message.content) ? message.content : [];
    const nonToolContent = content.filter((block) => !isJsonObject(block) || block.type !== "toolCall");

    events.push(baseEvent(record, "message", {
      role,
      content: nonToolContent,
      timestamp: message.timestamp,
      api: message.api,
      provider: message.provider,
      model: message.model,
      stopReason: message.stopReason,
      usage: message.usage,
    }, diagnostics));

    content.forEach((block, index) => {
      if (!isJsonObject(block) || block.type !== "toolCall") return;
      const toolCallId = asString(block.id);
      events.push(baseEvent(record, "tool_call", {
        toolCallId,
        toolName: block.name,
        arguments: block.arguments,
        partialJson: block.partialJson,
      }, diagnosticsForNested(record, diagnostics, index, toolCallId), { contentIndex: index, toolCallId }));
    });

    return events;
  }

  if (role === "toolResult") {
    const toolCallId = asString(message.toolCallId);
    return [baseEvent(record, "tool_result", {
      toolCallId,
      toolName: message.toolName,
      content: message.content,
      details: message.details,
      isError: message.isError,
      usage: message.usage,
      timestamp: message.timestamp,
    }, diagnostics, { toolCallId })];
  }

  if (role === "user") {
    return [baseEvent(record, "message", {
      role,
      content: message.content,
      timestamp: message.timestamp,
    }, diagnostics)];
  }

  if (role === "bashExecution") {
    return [baseEvent(record, "command", {
      command: message.command,
      output: message.output,
      exitStatus: message.exitStatus,
      cancelled: message.cancelled,
      truncated: message.truncated,
      overflowOutputFile: message.overflowOutputFile,
      excludeFromContext: message.excludeFromContext,
      timestamp: message.timestamp,
    }, diagnostics)];
  }

  return [unknownEvent(record, [
    ...diagnostics,
    diagnostic("unknown_message_role", "warning", "Pi message role is not normalized.", provenance(record)),
  ])];
};

const baseEvent = (
  record: SourceRecord,
  kind: NormalizedEvent["kind"],
  data: JsonObject,
  diagnostics: readonly Diagnostic[],
  nested: Pick<SourceProvenance, "contentIndex" | "toolCallId"> = {},
): NormalizedEvent => ({
  id: eventId(record, kind, nested.contentIndex),
  kind,
  provenance: provenance(record, nested),
  sourceRecord: record,
  data,
  diagnostics,
});

const unknownEvent = (
  record: SourceRecord,
  diagnostics: readonly Diagnostic[],
): NormalizedEvent =>
  baseEvent(record, "unknown", { sourceType: record.sourceType, raw: record.raw }, [
    ...diagnostics,
    diagnostic("unknown_record_type", "info", "Pi record is preserved without normalization.", provenance(record)),
  ]);

const isHeader = (record: SourceRecord): boolean =>
  (record.source.family === "pi-session-v3" && record.sourceType === "session") ||
  (record.source.family === "pi-session-v4" && record.sourceType === "header");

const provenance = (
  record: SourceRecord,
  nested: Pick<SourceProvenance, "contentIndex" | "toolCallId"> = {},
): SourceProvenance => ({
  harness: record.source.harness,
  family: record.source.family,
  ...(record.source.sessionId ? { sessionId: record.source.sessionId } : {}),
  ...(record.source.path ? { path: record.source.path } : {}),
  line: record.line,
  ...(record.entryId ? { entryId: record.entryId } : {}),
  ...("parentId" in record ? { parentId: record.parentId } : {}),
  ...(record.sourceType ? { sourceType: record.sourceType } : {}),
  ...nested,
});

const diagnosticsForRecord = (
  record: SourceRecord,
  diagnostics: readonly Diagnostic[],
): readonly Diagnostic[] =>
  diagnostics.filter((diag) => diag.location.line === record.line || diag.location.entryId === record.entryId);

const diagnosticsForNested = (
  record: SourceRecord,
  diagnostics: readonly Diagnostic[],
  contentIndex: number,
  toolCallId: string | undefined,
): readonly Diagnostic[] =>
  diagnostics.filter((diag) =>
    diag.location.line === record.line &&
    (diag.location.contentIndex === undefined || diag.location.contentIndex === contentIndex) &&
    (diag.location.toolCallId === undefined || diag.location.toolCallId === toolCallId)
  );

const eventId = (
  record: SourceRecord,
  kind: NormalizedEvent["kind"],
  contentIndex?: number,
): string => [
  record.source.sessionId ?? "unknown-session",
  String(record.line),
  record.entryId ?? "no-entry",
  kind,
  contentIndex === undefined ? "record" : `content-${contentIndex}`,
].join(":");
