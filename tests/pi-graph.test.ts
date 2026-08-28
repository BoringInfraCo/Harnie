import { describe, expect, it } from "vitest";
import { readPiJsonlText } from "../src/pi/reader.js";
import { validatePiGraph } from "../src/pi/graph.js";

describe("Pi graph validation", () => {
  it("accepts a valid parent chain from a fixture", () => {
    const result = readPiJsonlText([
      '{"type":"session","version":3,"id":"s1","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
      '{"type":"model_change","id":"a1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","provider":"p","modelId":"m"}',
      '{"type":"message","id":"a2","parentId":"a1","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"user","content":"hi"}}',
    ].join("\n"));

    expect(validatePiGraph(result.records).diagnostics).toEqual([]);
  });

  it("reports missing ids, duplicate ids, orphan parents, self parents, and cycles", () => {
    const result = readPiJsonlText([
      '{"type":"session","version":3,"id":"s1","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
      '{"type":"message","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"user","content":"missing id"}}',
      '{"type":"message","id":"dup","parentId":null,"timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"user","content":"one"}}',
      '{"type":"message","id":"dup","parentId":null,"timestamp":"2026-01-01T00:00:03.000Z","message":{"role":"user","content":"two"}}',
      '{"type":"message","id":"orphan","parentId":"absent","timestamp":"2026-01-01T00:00:04.000Z","message":{"role":"user","content":"orphan"}}',
      '{"type":"message","id":"self","parentId":"self","timestamp":"2026-01-01T00:00:05.000Z","message":{"role":"user","content":"self"}}',
      '{"type":"message","id":"c1","parentId":"c2","timestamp":"2026-01-01T00:00:06.000Z","message":{"role":"user","content":"cycle 1"}}',
      '{"type":"message","id":"c2","parentId":"c1","timestamp":"2026-01-01T00:00:07.000Z","message":{"role":"user","content":"cycle 2"}}',
    ].join("\n"));

    const codes = validatePiGraph(result.records).diagnostics.map((diag) => diag.code);

    expect(codes).toContain("missing_entry_id");
    expect(codes).toContain("duplicate_entry_id");
    expect(codes).toContain("orphan_parent");
    expect(codes).toContain("self_parent");
    expect(codes).toContain("parent_cycle");
  });
});
