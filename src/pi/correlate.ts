import { diagnostic } from "./diagnostics.js";
import type { Diagnostic, JsonObject, SourceRecord, ToolCallEvidence, ToolResultEvidence } from "../types.js";
import { asString, isJsonObject } from "../types.js";

export interface CorrelatePiToolsResult {
  readonly toolCalls: readonly ToolCallEvidence[];
  readonly toolResults: readonly ToolResultEvidence[];
  readonly diagnostics: readonly Diagnostic[];
}

export const correlatePiTools = (records: readonly SourceRecord[]): CorrelatePiToolsResult => {
  const toolCalls: ToolCallEvidence[] = [];
  const toolResults: ToolResultEvidence[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const record of records) {
    if (record.sourceType !== "message" || !isJsonObject(record.raw.message)) continue;
    const message = record.raw.message;
    const role = asString(message.role);

    if (role === "assistant" && Array.isArray(message.content)) {
      message.content.forEach((block, index) => {
        if (!isJsonObject(block) || block.type !== "toolCall" || typeof block.id !== "string") return;
        toolCalls.push({
          callId: block.id,
          toolName: asString(block.name),
          assistantEntryId: record.entryId,
          line: record.line,
          contentIndex: index,
          record,
          block,
          results: [],
          diagnostics: [],
        });
      });
    }

    if (role === "toolResult" && typeof message.toolCallId === "string") {
      toolResults.push({
        toolCallId: message.toolCallId,
        toolName: asString(message.toolName),
        entryId: record.entryId,
        line: record.line,
        record,
        message,
        diagnostics: [],
      });
    }
  }

  const callsById = groupBy(toolCalls, (call) => call.callId);
  const resultsById = groupBy(toolResults, (result) => result.toolCallId);
  const callsWithDiagnostics = new Map<ToolCallEvidence, Diagnostic[]>();
  const resultsWithDiagnostics = new Map<ToolResultEvidence, Diagnostic[]>();

  for (const call of toolCalls) {
    const sameIdCalls = callsById.get(call.callId) ?? [];
    const matchingResults = resultsById.get(call.callId) ?? [];
    const callDiagnostics: Diagnostic[] = [];

    if (sameIdCalls.length > 1) {
      callDiagnostics.push(diagnostic("duplicate_tool_call_id", "error", "Tool call id appears more than once.", callLocation(call), { toolCallId: call.callId }));
    }
    if (matchingResults.length === 0) {
      callDiagnostics.push(diagnostic("missing_tool_result", "warning", "Tool call has no matching tool result.", callLocation(call), { toolCallId: call.callId }));
    }
    if (matchingResults.length > 1) {
      callDiagnostics.push(diagnostic("duplicate_tool_result", "error", "Tool call has multiple matching tool results.", callLocation(call), { toolCallId: call.callId }));
    }
    callsWithDiagnostics.set(call, callDiagnostics);
    diagnostics.push(...callDiagnostics);
  }

  for (const result of toolResults) {
    const matchingCalls = callsById.get(result.toolCallId) ?? [];
    const resultDiagnostics: Diagnostic[] = [];

    if (matchingCalls.length === 0) {
      resultDiagnostics.push(diagnostic("orphan_tool_result", "warning", "Tool result does not match an observed tool call.", resultLocation(result), { toolCallId: result.toolCallId }));
    }
    if (matchingCalls.length > 1) {
      resultDiagnostics.push(diagnostic("ambiguous_tool_result", "error", "Tool result matches multiple observed tool calls.", resultLocation(result), { toolCallId: result.toolCallId }));
    }
    if ((resultsById.get(result.toolCallId) ?? []).length > 1) {
      resultDiagnostics.push(diagnostic("duplicate_tool_result", "error", "Multiple tool results share this toolCallId.", resultLocation(result), { toolCallId: result.toolCallId }));
    }
    resultsWithDiagnostics.set(result, resultDiagnostics);
    diagnostics.push(...resultDiagnostics);
  }

  const correlatedCalls = toolCalls.map((call) => ({
    ...call,
    results: callsById.get(call.callId)?.length === 1 ? resultsById.get(call.callId) ?? [] : [],
    diagnostics: callsWithDiagnostics.get(call) ?? [],
  }));
  const correlatedResults = toolResults.map((result) => ({
    ...result,
    diagnostics: resultsWithDiagnostics.get(result) ?? [],
  }));

  return { toolCalls: correlatedCalls, toolResults: correlatedResults, diagnostics };
};

const groupBy = <T>(values: readonly T[], key: (value: T) => string): Map<string, T[]> => {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const bucket = grouped.get(key(value)) ?? [];
    bucket.push(value);
    grouped.set(key(value), bucket);
  }
  return grouped;
};

const callLocation = (call: ToolCallEvidence) => ({
  path: call.record.source.path,
  line: call.line,
  entryId: call.assistantEntryId,
  contentIndex: call.contentIndex,
  toolCallId: call.callId,
});

const resultLocation = (result: ToolResultEvidence) => ({
  path: result.record.source.path,
  line: result.line,
  entryId: result.entryId,
  toolCallId: result.toolCallId,
});
