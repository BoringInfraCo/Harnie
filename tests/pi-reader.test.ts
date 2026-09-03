import { describe, expect, it } from "vitest";
import { readPiJsonlFile, readPiJsonlText } from "../src/pi/reader.js";

describe("Pi JSONL reader", () => {
  it("reads valid v3 fixture records without using a Pi loader", async () => {
    const result = await readPiJsonlFile("tests/fixtures/pi/minimal.jsonl");

    expect(result.source.harness).toBe("pi");
    expect(result.source.family).toBe("pi-session-v3");
    expect(result.source.sessionId).toBe("8072a61b-67e6-4618-8f35-5c5616aea2be");
    expect(result.records).toHaveLength(5);
    expect(result.records[0]?.line).toBe(1);
    expect(result.records[0]?.rawLine).toContain('"type":"session"');
    expect(result.records[3]?.entryId).toBe("b95c7ac4");
    expect(result.malformedLines).toHaveLength(0);
  });

  it("preserves valid records around malformed JSONL lines", () => {
    const text = [
      '{"type":"session","version":3,"id":"s1","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
      '{"type":"message","id":"a1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"user","content":"hi"}}',
      '{"type":',
      '{"type":"message","id":"a2","parentId":"a1","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"assistant","content":[]}}',
    ].join("\n");

    const result = readPiJsonlText(text, "/tmp/pi.jsonl");

    expect(result.records.map((record) => record.line)).toEqual([1, 2, 4]);
    expect(result.malformedLines).toHaveLength(1);
    expect(result.malformedLines[0]?.diagnostics[0]?.code).toBe("malformed_jsonl");
  });

  it("detects v4 headers and unknown source families from header evidence", () => {
    const v4 = readPiJsonlText('{"kind":"header","version":4,"id":"s4","createdAt":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}');
    const unknown = readPiJsonlText('{"type":"session","version":99,"id":"s99"}');

    expect(v4.source.family).toBe("pi-session-v4");
    expect(unknown.source.family).toBe("unknown");
    expect(unknown.diagnostics.map((diag) => diag.code)).toContain("unsupported_source_family");
  });

  it("reports empty and non-object JSONL evidence explicitly", () => {
    const result = readPiJsonlText('["not","an","object"]\n');

    expect(result.records).toHaveLength(0);
    expect(result.malformedLines[0]?.diagnostics[0]?.code).toBe("non_object_jsonl");
    expect(result.diagnostics.map((diag) => diag.code)).toContain("empty_session");
  });

  it("reads local trace A coding fixture", async () => {
    const result = await readPiJsonlFile("tests/fixtures/pi/trace-a-coding.jsonl");

    expect(result.source.harness).toBe("pi");
    expect(result.source.family).toBe("pi-session-v3");
    expect(result.source.sessionId).toBe("harnie-ta-075fe632");
    expect(result.records).toHaveLength(31);
    expect(result.malformedLines).toHaveLength(0);
    expect(result.records[0]?.sourceType).toBe("session");
    expect(result.records[0]?.raw.cwd).toBe("/workspace/pi-project");
  });

  it("reads local trace B unfinished fixture", async () => {
    const result = await readPiJsonlFile("tests/fixtures/pi/trace-b-unfinished.jsonl");

    expect(result.source.harness).toBe("pi");
    expect(result.source.family).toBe("pi-session-v3");
    expect(result.source.sessionId).toBe("harnie-tb-da82c4f8");
    expect(result.records).toHaveLength(13);
    expect(result.malformedLines).toHaveLength(0);
    expect(result.records[0]?.sourceType).toBe("session");
    expect(result.records[0]?.raw.cwd).toBe("/workspace/pi-project");
  });
});
