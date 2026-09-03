import { describe, expect, it } from "vitest";
import { correlatePiTools } from "../src/pi/correlate.js";
import { validatePiGraph } from "../src/pi/graph.js";
import { normalizePiRecords } from "../src/pi/normalize.js";
import { readPiJsonlFile, readPiJsonlText } from "../src/pi/reader.js";

describe("Pi conservative normalization", () => {
  it("normalizes fixture records into messages, tool calls, tool results, and unknown events", async () => {
    const result = await readPiJsonlFile("tests/fixtures/pi/coding.jsonl");
    const graph = validatePiGraph(result.records);
    const tools = correlatePiTools(result.records);
    const events = normalizePiRecords(result.records, { diagnostics: [...graph.diagnostics, ...tools.diagnostics] });

    expect(events.map((event) => event.kind)).toEqual([
      "unknown",
      "unknown",
      "message",
      "message",
      "tool_call",
      "tool_result",
      "message",
      "tool_call",
      "tool_result",
      "message",
      "tool_call",
      "tool_result",
      "message",
    ]);
    expect(events.find((event) => event.kind === "tool_call")?.data.toolName).toBe("bash");
    expect(events.find((event) => event.kind === "tool_call")?.kind).toBe("tool_call");
  });

  it("maps direct bashExecution messages to command events", () => {
    const result = readPiJsonlText([
      '{"type":"session","version":3,"id":"s1","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
      '{"type":"message","id":"b1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"bashExecution","command":"pwd","output":"/workspace","exitStatus":0,"timestamp":1767225601000}}',
    ].join("\n"));

    const [event] = normalizePiRecords(result.records);

    expect(event?.kind).toBe("command");
    expect(event?.data.command).toBe("pwd");
  });

  it("retains exact source provenance and the raw source record", async () => {
    const result = await readPiJsonlFile("tests/fixtures/pi/coding.jsonl");
    const events = normalizePiRecords(result.records);
    const toolCall = events.find((event) => event.kind === "tool_call");

    expect(toolCall?.provenance).toMatchObject({
      harness: "pi",
      family: "pi-session-v3",
      sessionId: "cfef1a72-fb89-43a3-bac0-6c7246eda6d8",
      line: 5,
      entryId: "014e0e43",
      sourceType: "message",
      contentIndex: 1,
      toolCallId: "call_HwVXtyxm9cijLQnxt8Yxp5Hb",
    });
    expect(toolCall?.sourceRecord.rawLine).toContain('"toolCall"');
  });

  it("preserves unknown valid records without guessing their meaning", () => {
    const result = readPiJsonlText([
      '{"type":"session","version":3,"id":"s1","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
      '{"type":"custom","id":"x1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","customType":"extension/private","data":{"shape":true}}',
    ].join("\n"));
    const [event] = normalizePiRecords(result.records);

    expect(event?.kind).toBe("unknown");
    expect(event?.data.raw).toEqual(result.records[1]?.raw);
    expect(event?.diagnostics.map((diag) => diag.code)).toContain("unknown_record_type");
  });

  it("normalizes trace A local coding fixture with tool calls and results", async () => {
    const result = await readPiJsonlFile("tests/fixtures/pi/trace-a-coding.jsonl");
    const graph = validatePiGraph(result.records);
    const tools = correlatePiTools(result.records);
    const events = normalizePiRecords(result.records, { diagnostics: [...graph.diagnostics, ...tools.diagnostics] });

    const toolCalls = events.filter((event) => event.kind === "tool_call");
    const writeCall = toolCalls.find((event) => event.data.toolName === "write");
    const errorResult = events.find((event) => event.kind === "tool_result" && event.data.isError === true);

    expect(events.some((event) => event.kind === "message")).toBe(true);
    expect(writeCall?.kind).toBe("tool_call");
    expect(writeCall?.data).not.toHaveProperty("operation");
    expect(errorResult?.data.toolName).toBe("write");
    expect(writeCall?.provenance).toMatchObject({
      harness: "pi",
      family: "pi-session-v3",
      sessionId: "harnie-ta-075fe632",
      sourceType: "message",
    });
    expect(writeCall?.sourceRecord.rawLine).toContain('"toolCall"');
  });

  it("normalizes trace B local unfinished fixture with partial progress", async () => {
    const result = await readPiJsonlFile("tests/fixtures/pi/trace-b-unfinished.jsonl");
    const graph = validatePiGraph(result.records);
    const tools = correlatePiTools(result.records);
    const events = normalizePiRecords(result.records, { diagnostics: [...graph.diagnostics, ...tools.diagnostics] });

    const toolCalls = events.filter((event) => event.kind === "tool_call");
    const pending = toolCalls.find((event) => event.data.toolCallId === "harnie-call-0006");

    expect(events.some((event) => event.kind === "message")).toBe(true);
    expect(toolCalls).toHaveLength(6);
    expect(events.filter((event) => event.kind === "tool_result")).toHaveLength(5);
    expect(pending?.kind).toBe("tool_call");
    expect(tools.diagnostics.map((diag) => diag.code)).toContain("missing_tool_result");
    expect(pending?.provenance.sessionId).toBe("harnie-tb-da82c4f8");
  });
});
