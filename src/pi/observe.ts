import { correlatePiTools } from "./correlate.js";
import { validatePiGraph } from "./graph.js";
import { normalizePiRecords } from "./normalize.js";
import type { ReadPiJsonlResult } from "./reader.js";
import { reconstructObservedWork } from "../work/observe.js";
import type { ObservedEvent, ObservedWorkInput, Provenance, Work } from "../work/types.js";
import type { NormalizedEvent, SourceProvenance, SourceRecord } from "../types.js";
import { asString } from "../types.js";

export const observePiSession = (read: ReadPiJsonlResult): Work => {
  const graph = validatePiGraph(read.records);
  const tools = correlatePiTools(read.records);
  const diagnostics = [...read.diagnostics, ...graph.diagnostics, ...tools.diagnostics];
  const events = normalizePiRecords(read.records, { diagnostics });
  return reconstructObservedWork(observedWorkInputFromPi(read, events, diagnostics));
};

export const observedWorkInputFromPi = (
  read: ReadPiJsonlResult,
  events: readonly NormalizedEvent[],
  diagnostics: ReadPiJsonlResult["diagnostics"] = read.diagnostics,
): ObservedWorkInput => {
  const header = headerRecord(read.records);
  const model = lastObservedModel(read.records, events);

  return {
    harness: read.source.harness,
    ...(read.source.sessionId ? { sourceId: read.source.sessionId } : {}),
    sourceFormat: read.source.family,
    ...(read.source.path ? { sourceLocation: read.source.path } : {}),
    ...(asString(header?.raw.cwd) ? { workspacePath: asString(header?.raw.cwd) } : {}),
    ...(header?.timestamp ? { startedAt: header.timestamp } : {}),
    ...(model.provider ? { provider: model.provider } : {}),
    ...(model.model ? { model: model.model } : {}),
    events: events.map(toObservedEvent),
    diagnostics,
  };
};

const toObservedEvent = (event: NormalizedEvent): ObservedEvent => ({
  id: event.id,
  kind: event.kind,
  ...(event.sourceRecord.timestamp ? { timestamp: event.sourceRecord.timestamp } : {}),
  payload: event.data,
  provenance: toProvenance(event.provenance),
  diagnostics: event.diagnostics,
});

const toProvenance = (source: SourceProvenance): Provenance => ({
  harness: source.harness,
  sourceFormat: source.family,
  ...(source.sessionId ? { sourceSession: source.sessionId } : {}),
  ...(source.path ? { sourceLocation: source.path } : {}),
  ...(source.sourceType ? { sourceType: source.sourceType } : {}),
  ...(source.entryId ? { sourceEntry: source.entryId } : {}),
  ...("parentId" in source ? { sourceParent: source.parentId } : {}),
  line: source.line,
  ...(source.contentIndex !== undefined ? { contentIndex: source.contentIndex } : {}),
  ...(source.toolCallId ? { toolCallId: source.toolCallId } : {}),
  observation: "observed",
});

const headerRecord = (records: readonly SourceRecord[]): SourceRecord | undefined =>
  records.find((record) => record.sourceType === "session" || record.sourceType === "header") ?? records[0];

const lastObservedModel = (
  records: readonly SourceRecord[],
  events: readonly NormalizedEvent[],
): { provider?: string; model?: string } => {
  let provider: string | undefined;
  let model: string | undefined;

  for (const record of records) {
    if (record.sourceType !== "model_change") continue;
    provider = asString(record.raw.provider) ?? provider;
    model = asString(record.raw.modelId) ?? model;
  }

  if (provider || model) return { ...(provider ? { provider } : {}), ...(model ? { model } : {}) };

  for (const event of events) {
    if (event.kind !== "message" || event.data.role !== "assistant") continue;
    provider = asString(event.data.provider) ?? provider;
    model = asString(event.data.model) ?? model;
  }

  return { ...(provider ? { provider } : {}), ...(model ? { model } : {}) };
};

