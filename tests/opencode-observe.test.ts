import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { observeOpenCodeSession } from "../src/opencode/observe.js";
import { readOpenCodeSnapshotFile } from "../src/opencode/reader.js";
import type { OpenCodeSessionSnapshot } from "../src/opencode/types.js";
import { deriveObservedWork } from "../src/work/derive.js";
import type { Work } from "../src/work/types.js";

const FIXTURE = "tests/fixtures/opencode/sprint-012-handoff.json";
const hasFixture = existsSync(FIXTURE);

const inlineSnapshot = (): OpenCodeSessionSnapshot => ({
  harness: "opencode",
  format: "opencode-session-v1",
  session: {
    id: "ses_inline",
    directory: "/workspace/harnie-project",
    title: "inline",
    model: { id: "test-model", providerID: "opencode" },
    time_created: 1_700_000_000_000,
    time_updated: 1_700_000_000_100,
  },
  messages: [
    { id: "msg_user", time_created: 1, data: { role: "user" } },
    { id: "msg_asst", time_created: 2, data: { role: "assistant" } },
  ],
  parts: [
    { id: "prt_empty", message_id: "msg_user", time_created: 1, data: { type: "text", text: "  " } },
    { id: "prt_user", message_id: "msg_user", time_created: 2, data: { type: "text", text: "Continue the work." } },
    { id: "prt_file", message_id: "msg_user", time_created: 3, data: { type: "file", filename: "HANDOFF.md" } },
    { id: "prt_step", message_id: "msg_asst", time_created: 4, data: { type: "step-start" } },
    {
      id: "prt_reason",
      message_id: "msg_asst",
      time_created: 5,
      data: { type: "reasoning", text: "secret chain of thought that must not be copied" },
    },
    {
      id: "prt_read",
      message_id: "msg_asst",
      time_created: 6,
      data: {
        type: "tool",
        tool: "read",
        callID: "call_read",
        state: {
          status: "completed",
          input: { filePath: "src/cli/handoff.ts" },
          output: "FULL FILE CONTENTS SHOULD NOT APPEAR",
        },
      },
    },
    {
      id: "prt_edit",
      message_id: "msg_asst",
      time_created: 7,
      data: {
        type: "tool",
        tool: "edit",
        callID: "call_edit",
        state: { status: "completed", input: { filePath: "src/cli/handoff.ts" } },
      },
    },
    { id: "prt_patch", message_id: "msg_asst", time_created: 8, data: { type: "patch", files: ["src/cli/handoff.ts"] } },
    { id: "prt_finish", message_id: "msg_asst", time_created: 9, data: { type: "step-finish" } },
  ],
});

describe("observeOpenCodeSession", () => {
  it("observes an inline OpenCode snapshot into Work", () => {
    const work = observeOpenCodeSession(inlineSnapshot());
    expectObservedOpenCodeWork(work, "ses_inline");

    const user = work.events.find((event) => event.kind === "message" && event.payload.role === "user");
    expect(user?.payload.content).toBe("Continue the work.");
    expect(work.events.some((event) => event.kind === "message" && event.payload.content === "  ")).toBe(false);

    const reasoning = work.events.filter((event) => event.provenance.sourceType === "reasoning");
    expect(reasoning.length).toBeGreaterThan(0);
    expect(reasoning.every((event) => event.kind === "unknown")).toBe(true);
    expect(reasoning.every((event) => !JSON.stringify(event.payload).includes("secret chain of thought"))).toBe(true);

    const read = work.events.find((event) => event.kind === "tool_call" && event.payload.toolName === "read");
    const readResult = work.events.find((event) =>
      event.kind === "tool_result" && event.payload.toolCallId === read?.payload.toolCallId
    );
    expect(readResult?.payload.content).toBe("completed");
    expect(JSON.stringify(readResult?.payload)).not.toContain("FULL FILE CONTENTS");

    const derived = deriveObservedWork(work);
    expect(derived.operations?.some((operation) => operation.path?.includes("handoff.ts"))).toBe(true);
  });

  it.skipIf(!hasFixture)("observes the sprint-012 OpenCode fixture", async () => {
    const snapshot = await readOpenCodeSnapshotFile(FIXTURE);
    const work = observeOpenCodeSession(snapshot);

    expectObservedOpenCodeWork(work, snapshot.session.id);
    expect(work.workspace).toEqual({ path: "/workspace/harnie-project" });
    expect(work.executions[0]?.provider).toBe("opencode");
    expect(work.executions[0]?.model).toBe("mimo-v2.5-free");
    expect(work.createdAt).toBe(new Date(snapshot.session.time_created).toISOString());

    const derived = deriveObservedWork(work);
    const readHandoff = snapshot.parts.some((part) =>
      part.data.type === "tool" &&
      part.data.tool === "read" &&
      (part.data.state?.input?.filePath?.includes("handoff.ts") === true ||
        part.data.state?.input?.path?.includes("handoff.ts") === true)
    );
    if (readHandoff) {
      expect(derived.operations?.some((operation) => operation.path?.includes("handoff.ts"))).toBe(true);
    }
  });
});

const expectObservedOpenCodeWork = (work: Work, sessionId: string): void => {
  expect(work.id.startsWith("work:opencode:")).toBe(true);
  expect(work.id).toBe(`work:opencode:${sessionId}`);
  expect(work.workspace).toEqual({ path: "/workspace/harnie-project" });
  expect(work.executions[0]?.harness).toBe("opencode");
  expect(work.executions[0]?.sourceSession).toMatchObject({
    harness: "opencode",
    sourceId: sessionId,
    sourceFormat: "opencode-session-v1",
  });

  const toolCalls = work.events.filter((event) => event.kind === "tool_call");
  expect(toolCalls.some((event) => event.payload.toolName === "read" || event.payload.toolName === "edit")).toBe(true);

  for (const call of toolCalls) {
    const toolCallId = call.payload.toolCallId;
    expect(typeof toolCallId).toBe("string");
    const result = work.events.find((event) =>
      event.kind === "tool_result" && event.payload.toolCallId === toolCallId
    );
    expect(result).toBeDefined();
    expect(result?.id).toBe(`opencode:${sessionId}:${call.provenance.sourceEntry}:tool_result`);
  }

  expect(work.events.map((event) => event.kind)).not.toContain("file_read");
  expect(work.events.map((event) => event.kind)).not.toContain("file_write");

  for (const event of work.events) {
    expect(event.provenance.harness).toBe("opencode");
    expect(event.provenance.observation).toBe("observed");
    expect(event.provenance.line).toBeGreaterThanOrEqual(0);
    expect(event.id.startsWith(`opencode:${sessionId}:`)).toBe(true);
  }
};
