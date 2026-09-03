import { describe, expect, it } from "vitest";
import { observePiSession } from "../src/pi/observe.js";
import { readPiJsonlFile, readPiJsonlText } from "../src/pi/reader.js";
import { deriveObservedWork } from "../src/work/derive.js";
import { extractToolOperations } from "../src/work/operations.js";
import type { ToolOperation } from "../src/work/types.js";

describe("observed tool operations", () => {
  it("records fixture C edit paths as succeeded without specializing event kinds", async () => {
    const observed = observePiSession(await readPiJsonlFile("tests/fixtures/pi/stateful-prefix.jsonl"));
    const derived = deriveObservedWork(observed);
    const operations = derived.operations ?? [];

    expect(operations.map((operation) => operation.path).some((path) => path?.endsWith("packages/ai/src/models.ts"))).toBe(true);
    expect(operations.map((operation) => operation.path).some((path) => path?.endsWith("packages/agent/src/types.ts"))).toBe(true);

    const edits = operations.filter((operation) =>
      operation.toolName === "edit" &&
      (operation.path?.endsWith("packages/ai/src/models.ts") || operation.path?.endsWith("packages/agent/src/types.ts"))
    );
    expect(edits.length).toBeGreaterThanOrEqual(2);
    expect(edits.every((operation) => operation.status === "succeeded")).toBe(true);

    expect(derived.events.map((event) => event.kind)).not.toContain("file_read");
    expect(derived.events.map((event) => event.kind)).not.toContain("file_write");
    expectObservedOperations(operations);
  });

  it("records trace B files and a pending .git/config next step", async () => {
    const observed = observePiSession(await readPiJsonlFile("tests/fixtures/pi/trace-b-unfinished.jsonl"));
    const derived = deriveObservedWork(observed);
    const operations = derived.operations ?? [];
    const paths = operations.map((operation) => operation.path);

    expect(paths.some((path) => path === "README.md" || path?.endsWith("README.md"))).toBe(true);
    expect(paths.some((path) => path === "analysis.js" || path?.endsWith("analysis.js"))).toBe(true);
    expect(paths.some((path) => path === "config.json" || path?.endsWith("config.json"))).toBe(true);

    const pending = operations.find((operation) =>
      operation.path === ".git/config" || operation.path?.endsWith(".git/config")
    );
    expect(pending?.status).toBe("pending");
    expect(derived.nextSteps?.some((step) => step.description.includes(".git/config"))).toBe(true);
    expect(derived.nextSteps?.[0]?.description).toMatch(/Complete pending tool call read .git\/config/);
    expectObservedOperations(operations);
  });

  it("skips tool calls with no name, path, or command", () => {
    const work = observePiSession(readPiJsonlText([
      '{"type":"session","version":3,"id":"s-empty","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
      '{"type":"message","id":"a1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"c1"}]}}',
    ].join("\n")));

    expect(work.events.some((event) => event.kind === "tool_call")).toBe(true);
    expect(extractToolOperations(work)).toEqual([]);
    expect(deriveObservedWork(work)).not.toHaveProperty("operations");
  });

  it("marks tool operations failed when the matching result isError is true", () => {
    const work = observePiSession(readPiJsonlText([
      '{"type":"session","version":3,"id":"s-error","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
      '{"type":"message","id":"a1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"c1","name":"write","arguments":{"path":".env"}}]}}',
      '{"type":"message","id":"r1","parentId":"a1","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"toolResult","toolCallId":"c1","toolName":"write","content":[{"type":"text","text":"Permission denied"}],"isError":true}}',
    ].join("\n")));
    const operations = extractToolOperations(work);

    expect(operations).toHaveLength(1);
    expect(operations[0]?.toolName).toBe("write");
    expect(operations[0]?.path).toBe(".env");
    expect(operations[0]?.status).toBe("failed");
    expect(operations[0]?.note).toBe("Permission denied");
    expectObservedOperations(operations);
  });
});

const expectObservedOperations = (operations: readonly ToolOperation[]): void => {
  expect(operations.length).toBeGreaterThan(0);
  for (const operation of operations) {
    expect(operation.evidence.length).toBeGreaterThanOrEqual(1);
    expect(operation.provenance.observation).toBe("observed");
    expect(operation.rule).toBe("tool-call-arguments");
    if (operation.note) expect(operation.note.length).toBeLessThanOrEqual(120);
  }
};
