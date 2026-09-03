import { describe, expect, it } from "vitest";
import { observeCodexSession } from "../src/codex/observe.js";
import { readCodexJsonlFile } from "../src/codex/reader.js";
import { asString, isJsonObject } from "../src/types.js";
import { deriveObservedWork } from "../src/work/derive.js";
import type { WorkEvent } from "../src/work/types.js";

const FIXTURE = "tests/fixtures/codex/unfinished-read.jsonl";
const SESSION_ID = "01codexunfinished000000000001";

describe("observeCodexSession", () => {
  it("observes the unfinished Codex rollout fixture into Work", async () => {
    const rollout = await readCodexJsonlFile(FIXTURE);
    const work = observeCodexSession(rollout);

    expect(work.id).toBe(`work:codex:${SESSION_ID}`);
    expect(work.workspace).toEqual({ path: "/workspace/codex-project" });
    expect(work.executions[0]?.harness).toBe("codex");
    expect(work.executions[0]?.model).toBe("gpt-5.4");
    expect(work.executions[0]?.sourceSession).toMatchObject({
      harness: "codex",
      sourceId: SESSION_ID,
      sourceFormat: "codex-rollout-v1",
    });

    const user = work.events.find((event) => event.kind === "message" && event.payload.role === "user");
    expect(asString(user?.payload.content)).toContain("--quiet");

    const exec = work.events.find((event) =>
      event.kind === "tool_call" &&
      event.payload.toolName === "exec_command" &&
      argumentString(event, "command")?.includes("cat src/cli.ts") === true
    );
    expect(exec?.payload.toolCallId).toBe("call_read_1");
    expect(argumentString(exec, "path")).toBeUndefined();

    const execResult = work.events.find((event) =>
      event.kind === "tool_result" && event.payload.toolCallId === exec?.payload.toolCallId
    );
    expect(execResult).toBeDefined();
    expect(execResult?.payload.toolCallId).toBe("call_read_1");

    const patch = work.events.find((event) =>
      event.kind === "tool_call" && event.payload.toolName === "apply_patch"
    );
    expect(argumentString(patch, "path")).toBe("src/cli.ts");

    const pending = work.events.find((event) =>
      event.kind === "tool_call" &&
      event.payload.toolName === "exec_command" &&
      argumentString(event, "command")?.includes("cat src/quiet.ts") === true
    );
    expect(pending?.payload.toolCallId).toBe("call_pending_1");
    expect(work.events.some((event) =>
      event.kind === "tool_result" && event.payload.toolCallId === pending?.payload.toolCallId
    )).toBe(false);

    const reasoning = work.events.filter((event) => event.provenance.sourceType === "reasoning");
    expect(reasoning.length).toBeGreaterThan(0);
    expect(reasoning.every((event) => event.kind === "unknown")).toBe(true);
    expect(JSON.stringify(work.events)).not.toContain("secretly rewrite");

    for (const event of work.events) {
      expect(event.provenance.harness).toBe("codex");
      expect(event.provenance.observation).toBe("observed");
      expect(event.provenance.sourceFormat).toBe("codex-rollout-v1");
      expect(event.provenance.sourceSession).toBe(SESSION_ID);
      expect(event.id).toBe(`codex:${SESSION_ID}:${event.provenance.line}:${event.kind}`);
    }

    const derived = deriveObservedWork(work);
    expect(derived.decisions?.some((decision) =>
      decision.summary.includes("I will update the quiet flag next")
    )).toBe(true);
    expect(derived.decisions?.some((decision) => /secretly rewrite/i.test(decision.summary))).not.toBe(true);
    expect(JSON.stringify(derived.decisions ?? [])).not.toContain("secretly rewrite");
  });
});

const argumentString = (event: WorkEvent | undefined, key: "path" | "command"): string | undefined => {
  if (!event || !isJsonObject(event.payload.arguments)) return undefined;
  return asString(event.payload.arguments[key]);
};
