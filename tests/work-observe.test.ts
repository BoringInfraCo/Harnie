import { describe, expect, it } from "vitest";
import { observePiSession } from "../src/pi/observe.js";
import { readPiJsonlFile, readPiJsonlText } from "../src/pi/reader.js";
import { reconstructObservedWork } from "../src/work/observe.js";
import type { ObservedEvent } from "../src/work/types.js";

describe("observed Work reconstruction", () => {
  it("reconstructs trace B as one unfinished Work with one Pi execution", async () => {
    const work = observePiSession(await readPiJsonlFile("tests/fixtures/pi/trace-b-unfinished.jsonl"));
    const execution = work.executions[0];

    expect(work.id).toBe("work:pi:harnie-tb-da82c4f8");
    expect(work.executions).toHaveLength(1);
    expect(work.workspace).toEqual({ path: "/workspace/pi-project" });
    expect(execution?.harness).toBe("pi");
    expect(execution?.sourceSession).toMatchObject({
      harness: "pi",
      sourceId: "harnie-tb-da82c4f8",
      sourceFormat: "pi-session-v3",
    });
    expect(execution?.provider).toBe("openai-codex");
    expect(execution?.model).toBe("gpt-5.4");
    expect(work.events.some((event) => event.kind === "tool_call" && event.payload.toolCallId === "harnie-call-0006")).toBe(true);
    expect(work.events.filter((event) => event.kind === "tool_result")).toHaveLength(5);
    expect(work.diagnostics.map((diag) => diag.code)).toContain("missing_tool_result");
    expect(work).not.toHaveProperty("goal");
    expect(work).not.toHaveProperty("decisions");
    expect(work).not.toHaveProperty("findings");
    expect(work).not.toHaveProperty("nextSteps");
  });

  it("reconstructs trace A tool activity without specializing write/read/bash", async () => {
    const work = observePiSession(await readPiJsonlFile("tests/fixtures/pi/trace-a-coding.jsonl"));
    const toolCalls = work.events.filter((event) => event.kind === "tool_call");
    const writeCall = toolCalls.find((event) => event.payload.toolName === "write");
    const errorResult = work.events.find((event) => event.kind === "tool_result" && event.payload.isError === true);

    expect(work.id).toBe("work:pi:harnie-ta-075fe632");
    expect(toolCalls.map((event) => event.payload.toolName)).toEqual([
      "write",
      "read",
      "bash",
      "bash",
      "bash",
      "write",
      "bash",
    ]);
    expect(toolCalls.every((event) => event.kind === "tool_call")).toBe(true);
    expect(writeCall?.payload).not.toHaveProperty("operation");
    expect(errorResult?.payload.toolName).toBe("write");
    expect(work.events.map((event) => event.kind)).not.toContain("file_read");
    expect(work.events.map((event) => event.kind)).not.toContain("file_write");
  });

  it("reconstructs fixture C without inventing a Decision object", async () => {
    const work = observePiSession(await readPiJsonlFile("tests/fixtures/pi/stateful-prefix.jsonl"));

    expect(work.id).toBe("work:pi:ba67782f-c80e-4287-aa82-b8e8d08a839a");
    expect(work.workspace).toEqual({ path: "/workspace/pi-project" });
    expect(work.executions[0]?.provider).toBe("anthropic");
    expect(work.executions[0]?.model).toBe("claude-opus-4-5");
    expect(work).not.toHaveProperty("decisions");
    expect(work).not.toHaveProperty("goal");
    expect(work).not.toHaveProperty("findings");
    expect(work.events.some((event) => event.kind === "message")).toBe(true);
    expect(work.events.some((event) => event.kind === "tool_call")).toBe(true);
  });

  it("retains provenance to a source line on every Work event", async () => {
    const work = observePiSession(await readPiJsonlFile("tests/fixtures/pi/trace-b-unfinished.jsonl"));

    expect(work.events.length).toBeGreaterThan(0);
    for (const event of work.events) {
      expect(event.provenance.observation).toBe("observed");
      expect(event.provenance.harness).toBe("pi");
      expect(event.provenance.line).toBeGreaterThan(0);
      expect(event.workId).toBe(work.id);
      expect(event.executionId).toBe(work.executions[0]?.id);
    }
  });

  it("is deterministic for the same source identities", async () => {
    const read = await readPiJsonlFile("tests/fixtures/pi/trace-b-unfinished.jsonl");
    const first = observePiSession(read);
    const second = observePiSession(read);

    expect(second).toEqual(first);
    expect(first.id).toBe("work:pi:harnie-tb-da82c4f8");
    expect(first.executions[0]?.id).toBe("execution:pi:harnie-tb-da82c4f8");
  });

  it("reconstructs harness-neutral input without Pi types", () => {
    const event: ObservedEvent = {
      id: "example:1:message",
      kind: "message",
      timestamp: "2026-01-01T00:00:01.000Z",
      payload: { role: "user", content: "continue" },
      provenance: {
        harness: "example",
        sourceFormat: "example-v1",
        sourceSession: "s1",
        line: 2,
        observation: "observed",
      },
      diagnostics: [],
    };

    const work = reconstructObservedWork({
      harness: "example",
      sourceId: "s1",
      sourceFormat: "example-v1",
      workspacePath: "/workspace",
      startedAt: "2026-01-01T00:00:00.000Z",
      events: [event],
    });

    expect(work.id).toBe("work:example:s1");
    expect(work.executions[0]?.id).toBe("execution:example:s1");
    expect(work.events[0]?.payload).toEqual({ role: "user", content: "continue" });
    expect(work.diagnostics).toEqual([]);
  });

  it("warns when source session id or workspace path is missing", () => {
    const work = reconstructObservedWork({
      harness: "pi",
      events: [],
    });

    expect(work.id).toBe("work:pi:unknown-session");
    expect(work.workspace).toBeUndefined();
    expect(work.diagnostics.map((diag) => diag.code)).toEqual([
      "missing_source_session_id",
      "missing_workspace",
    ]);
  });

  it("keeps a header-only session as valid observed Work", () => {
    const work = observePiSession(readPiJsonlText(
      '{"type":"session","version":3,"id":"s1","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
    ));

    expect(work.id).toBe("work:pi:s1");
    expect(work.workspace).toEqual({ path: "/workspace" });
    expect(work.events).toEqual([]);
    expect(work.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });
});
