import { describe, expect, it } from "vitest";
import { correlatePiTools } from "../src/pi/correlate.js";
import { readPiJsonlFile, readPiJsonlText } from "../src/pi/reader.js";

describe("Pi tool correlation", () => {
  it("correlates fixture assistant tool-call blocks to tool results by toolCallId", async () => {
    const result = await readPiJsonlFile("tests/fixtures/pi/coding.jsonl");
    const correlated = correlatePiTools(result.records);

    expect(correlated.toolCalls).toHaveLength(3);
    expect(correlated.toolResults).toHaveLength(3);
    expect(correlated.toolCalls.map((call) => call.results.length)).toEqual([1, 1, 1]);
    expect(correlated.diagnostics).toEqual([]);
  });

  it("reports missing, orphan, duplicate, and ambiguous tool evidence", () => {
    const result = readPiJsonlText([
      '{"type":"session","version":3,"id":"s1","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
      '{"type":"message","id":"a1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"missing","name":"bash","arguments":{"command":"pwd"}},{"type":"toolCall","id":"dup","name":"read","arguments":{"path":"a"}},{"type":"toolCall","id":"dup","name":"custom","arguments":{}}]}}',
      '{"type":"message","id":"r1","parentId":"a1","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"toolResult","toolCallId":"orphan","toolName":"bash","content":[]}}',
      '{"type":"message","id":"r2","parentId":"r1","timestamp":"2026-01-01T00:00:03.000Z","message":{"role":"toolResult","toolCallId":"dup","toolName":"read","content":[]}}',
      '{"type":"message","id":"r3","parentId":"r2","timestamp":"2026-01-01T00:00:04.000Z","message":{"role":"toolResult","toolCallId":"dup","toolName":"read","content":[]}}',
    ].join("\n"));

    const codes = correlatePiTools(result.records).diagnostics.map((diag) => diag.code);

    expect(codes).toContain("missing_tool_result");
    expect(codes).toContain("orphan_tool_result");
    expect(codes).toContain("duplicate_tool_call_id");
    expect(codes).toContain("duplicate_tool_result");
    expect(codes).toContain("ambiguous_tool_result");
  });

  it("correlates trace A local coding fixture tool calls to results", async () => {
    const result = await readPiJsonlFile("tests/fixtures/pi/trace-a-coding.jsonl");
    const correlated = correlatePiTools(result.records);

    expect(correlated.toolCalls).toHaveLength(7);
    expect(correlated.toolResults).toHaveLength(7);
    expect(correlated.toolCalls.map((call) => call.toolName)).toEqual([
      "write",
      "read",
      "bash",
      "bash",
      "bash",
      "write",
      "bash",
    ]);
    expect(correlated.toolCalls.every((call) => call.results.length === 1)).toBe(true);
    expect(correlated.diagnostics).toEqual([]);
  });

  it("correlates trace B local unfinished fixture tool calls to results", async () => {
    const result = await readPiJsonlFile("tests/fixtures/pi/trace-b-unfinished.jsonl");
    const correlated = correlatePiTools(result.records);

    expect(correlated.toolCalls).toHaveLength(6);
    expect(correlated.toolResults).toHaveLength(5);
    expect(correlated.toolCalls.filter((call) => call.results.length === 0)).toHaveLength(1);
    expect(correlated.diagnostics.map((diag) => diag.code)).toContain("missing_tool_result");
  });
});
