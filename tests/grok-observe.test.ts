import { describe, expect, it } from "vitest";
import { observeGrokSession } from "../src/grok/observe.js";
import { readGrokSessionPath } from "../src/grok/reader.js";
import { asString, isJsonObject } from "../src/types.js";
import { deriveObservedWork } from "../src/work/derive.js";
import type { WorkEvent } from "../src/work/types.js";

const FIXTURE_DIR = "tests/fixtures/grok/unfinished-demo";
const SESSION_ID = "01grokdemo000000000000000001";

describe("observeGrokSession", () => {
  it("observes the unfinished Grok fixture into Work", async () => {
    const session = await readGrokSessionPath(FIXTURE_DIR);
    const work = observeGrokSession(session);

    expect(work.id).toBe(`work:grok:${SESSION_ID}`);
    expect(work.workspace).toEqual({ path: "/workspace/grok-project" });
    expect(work.executions[0]?.harness).toBe("grok");
    expect(work.executions[0]?.model).toBe("grok-4.6");
    expect(work.executions[0]?.sourceSession).toMatchObject({
      harness: "grok",
      sourceId: SESSION_ID,
      sourceFormat: "grok-chat-v1",
    });

    // The goal is the first <user_query>, not the environment injection.
    const user = work.events.find((event) => event.kind === "message" && event.payload.role === "user");
    expect(asString(user?.payload.content)).toContain("demo video catalog");
    expect(JSON.stringify(work.events.filter((event) => event.kind === "message"))).not.toContain("user_info");

    const read = work.events.find((event) =>
      event.kind === "tool_call" && event.payload.toolName === "read_file"
    );
    expect(read?.payload.toolCallId).toBe("call_read_1");
    expect(argumentString(read, "path")).toBe("/workspace/grok-project/src/launch/data.ts");
    expect(argumentString(read, "command")).toBeUndefined();

    const readResult = work.events.find((event) =>
      event.kind === "tool_result" && event.payload.toolCallId === "call_read_1"
    );
    expect(readResult).toBeDefined();
    expect(readResult?.payload.isError).toBe(false);

    const render = work.events.find((event) =>
      event.kind === "tool_call" && event.payload.toolName === "run_terminal_command"
    );
    expect(argumentString(render, "command")).toBe("npx remotion render Catalog out/catalog.mp4");

    const renderResult = work.events.find((event) =>
      event.kind === "tool_result" && event.payload.toolCallId === "call_run_1"
    );
    expect(renderResult?.payload.isError).toBe(true);

    // Bulky edit payloads are dropped; only path survives.
    const pending = work.events.find((event) =>
      event.kind === "tool_call" && event.payload.toolCallId === "call_pending_1"
    );
    expect(argumentString(pending, "path")).toBe("/workspace/grok-project/src/launch/Catalog.tsx");
    expect(JSON.stringify(pending?.payload)).not.toContain("PLACEHOLDER");
    expect(work.events.some((event) =>
      event.kind === "tool_result" && event.payload.toolCallId === "call_pending_1"
    )).toBe(false);

    const reasoning = work.events.filter((event) => event.provenance.sourceType === "reasoning");
    expect(reasoning.length).toBeGreaterThan(0);
    expect(reasoning.every((event) => event.kind === "unknown")).toBe(true);
    expect(JSON.stringify(work.events)).not.toContain("secretly rewrite");

    // Backend telemetry and context injections stay unknown evidence.
    expect(work.events.some((event) => event.provenance.sourceType === "backend_tool_call" && event.kind === "unknown")).toBe(true);
    expect(work.events.some((event) => event.provenance.sourceType === "user_context" && event.kind === "unknown")).toBe(true);
    // The static system prompt is skipped entirely.
    expect(work.events.some((event) => event.provenance.sourceType === "system")).toBe(false);

    const kinds = work.events.map((event) => event.kind);
    expect(kinds.filter((kind) => kind === "message").length).toBe(4);
    expect(kinds.filter((kind) => kind === "tool_call").length).toBe(3);
    expect(kinds.filter((kind) => kind === "tool_result").length).toBe(2);
    expect(kinds.filter((kind) => kind === "unknown").length).toBe(3);

    const ids = work.events.map((event) => event.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const event of work.events) {
      expect(event.provenance.harness).toBe("grok");
      expect(event.provenance.observation).toBe("observed");
      expect(event.provenance.sourceFormat).toBe("grok-chat-v1");
      expect(event.provenance.sourceSession).toBe(SESSION_ID);
    }

    const derived = deriveObservedWork(work);
    expect(derived.goal?.statement).toContain("demo video catalog");
    expect(derived.decisions?.some((decision) =>
      decision.summary.includes("I will scaffold the catalog composition next")
    )).toBe(true);
    expect(JSON.stringify(derived.decisions ?? [])).not.toContain("secretly rewrite");
    const statuses = (derived.operations ?? []).map((operation) => operation.status).sort();
    expect(statuses).toEqual(["failed", "pending", "succeeded"]);
  });
});

const argumentString = (event: WorkEvent | undefined, key: "path" | "command"): string | undefined => {
  if (!event || !isJsonObject(event.payload.arguments)) return undefined;
  return asString(event.payload.arguments[key]);
};
