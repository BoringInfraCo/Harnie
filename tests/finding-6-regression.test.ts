import { describe, expect, it } from "vitest";
import { extractObservedContext } from "../src/work/context.js";
import { buildHandoffFromWork } from "../src/work/handoff.js";
import type { Work, WorkEvent } from "../src/work/types.js";

const prov = (line: number) =>
  ({ harness: "synthetic", line, observation: "observed" }) as const;

let seq = 0;
const aid = (prefix: string): string => `${prefix}:${(seq += 1)}`;void aid;

const call = (
  id: string,
  executionId: string,
  toolName: string,
  args: Record<string, string>,
  callId: string,
): WorkEvent => ({
  id,
  workId: "work:verify:1",
  executionId,
  kind: "tool_call",
  payload: { toolName, arguments: args, toolCallId: callId },
  provenance: { ...prov(1) },
  diagnostics: [],
});

const result = (
  id: string,
  executionId: string,
  callId: string,
  isError: boolean,
): WorkEvent => ({
  id,
  workId: "work:verify:1",
  executionId,
  kind: "tool_result",
  payload: { toolCallId: callId, isError, content: [{ type: "text", text: isError ? "FAIL" : "ok" }] },
  provenance: { ...prov(1) },
  diagnostics: [],
});

const pendingCall = (
  id: string,
  executionId: string,
  toolName: string,
  args: Record<string, string>,
  callId: string,
): WorkEvent => call(id, executionId, toolName, args, callId);

const workWith = (events: readonly WorkEvent[]): Work => ({
  id: "work:verify:1",
  executions: [
    {
      id: "execution:verify:1",
      workId: "work:verify:1",
      harness: "synthetic",
      sourceSession: { harness: "synthetic", sourceId: "s-1" },
    },
  ],
  events: [...events],
  diagnostics: [],
});

describe("finding 6 — verification follows the latest edit", () => {
  it("stale success: npm test before the latest edit is not verification", () => {
    seq = 0;
    const work = workWith([
      call("e-test-call", "execution:verify:1", "bash", { command: "npm test" }, "t1"),
      result("e-test-result", "execution:verify:1", "t1", false),
      call("e-edit-call", "execution:verify:1", "edit", { path: "src/a.ts" }, "e1"),
      result("e-edit-result", "execution:verify:1", "e1", false),
    ]);
    const context = extractObservedContext(work);
    const handoff = buildHandoffFromWork(work);

    // The audit repro: presence of a passing test must not suppress the hint.
    expect(context.testState).toMatch(/npm test/i);
    expect(context.testState).toMatch(/unverified/i);
    expect(context.verification).toMatch(/not recorded after latest edit/i);
    expect(context.continuation.join("\n")).toMatch(/verify/i);
    // One consistent status: current state must agree that edits are unverified.
    expect(handoff.currentState).toMatch(/unverified|not recorded/i);
    expect(handoff.testState).toMatch(/unverified/i);
    expect(handoff.verification).toMatch(/not recorded after latest edit/i);
    expect(handoff.nextSteps.join("\n")).toMatch(/verify/i);
  });

  it("successful test after the latest edit counts as verification", () => {
    const work = workWith([
      call("e-edit-call", "execution:verify:1", "edit", { path: "src/a.ts" }, "e1"),
      result("e-edit-result", "execution:verify:1", "e1", false),
      call("e-test-call", "execution:verify:1", "bash", { command: "npm test" }, "t1"),
      result("e-test-result", "execution:verify:1", "t1", false),
    ]);
    const context = extractObservedContext(work);
    const handoff = buildHandoffFromWork(work);

    expect(context.verification).toMatch(/succeeded after latest edit/i);
    expect(context.testState).not.toMatch(/unverified/i);
    expect(context.continuation.join("\n")).not.toMatch(/verify the edits/i);
    expect(handoff.currentState).toMatch(/succeed/i);
    expect(handoff.currentState).not.toMatch(/not recorded/i);
  });

  it("failed test after the latest edit reports failure with a rerun action", () => {
    const work = workWith([
      call("e-edit-call", "execution:verify:1", "edit", { path: "src/a.ts" }, "e1"),
      result("e-edit-result", "execution:verify:1", "e1", false),
      call("e-test-call", "execution:verify:1", "bash", { command: "npm test" }, "t1"),
      result("e-test-result", "execution:verify:1", "t1", true),
    ]);
    const context = extractObservedContext(work);
    const handoff = buildHandoffFromWork(work);

    expect(context.testState).toMatch(/failed/);
    expect(context.verification).toMatch(/failed after latest edit/i);
    expect(context.continuation.join("\n")).toMatch(/rerun tests|failed verification/i);
    expect(handoff.currentState).toMatch(/fail/i);
  });

  it("pending test after the latest edit reports pending verification", () => {
    const work = workWith([
      call("e-edit-call", "execution:verify:1", "edit", { path: "src/a.ts" }, "e1"),
      result("e-edit-result", "execution:verify:1", "e1", false),
      pendingCall("e-test-call", "execution:verify:1", "bash", { command: "npm test" }, "t1"),
    ]);
    const context = extractObservedContext(work);
    const handoff = buildHandoffFromWork(work);

    expect(context.testState).toMatch(/pending/);
    expect(context.verification).toMatch(/pending after latest edit/i);
    // The appropriate next action is completing the pending test run.
    expect(context.continuation.join("\n")).toMatch(/complete pending tool call/i);
    expect(context.unresolved).toMatch(/pending/i);
    expect(handoff.currentState).toMatch(/pending/i);
  });

  it("edit with no test at all records missing verification", () => {
    const work = workWith([
      call("e-edit-call", "execution:verify:1", "edit", { path: "src/a.ts" }, "e1"),
      result("e-edit-result", "execution:verify:1", "e1", false),
    ]);
    const context = extractObservedContext(work);
    const handoff = buildHandoffFromWork(work);

    expect(context.testState).toBeUndefined();
    expect(context.verification).toMatch(/not recorded/i);
    expect(context.continuation.join("\n")).toMatch(/verify/i);
    expect(handoff.currentState).toMatch(/not recorded/i);
  });

  it("failed test with no edits still surfaces a failure status and rerun action", () => {
    const work = workWith([
      call("e-test-call", "execution:verify:1", "bash", { command: "npm test" }, "t1"),
      result("e-test-result", "execution:verify:1", "t1", true),
    ]);
    const context = extractObservedContext(work);
    const handoff = buildHandoffFromWork(work);

    expect(context.testState).toMatch(/failed/);
    expect(context.verification).toMatch(/failed/i);
    expect(context.continuation.join("\n")).toMatch(/rerun tests/i);
    expect(handoff.currentState).toMatch(/fail/i);
    expect(handoff.nextSteps.join("\n")).toMatch(/rerun tests/i);
  });

  it("execution-scoped result matching: same call id in another execution is not verification", () => {
    const multi: Work = {
      id: "work:verify:1",
      executions: [
        {
          id: "execution:A",
          workId: "work:verify:1",
          harness: "synthetic",
          sourceSession: { harness: "synthetic", sourceId: "s-A" },
        },
        {
          id: "execution:B",
          workId: "work:verify:1",
          harness: "synthetic",
          sourceSession: { harness: "synthetic", sourceId: "s-B" },
        },
      ],
      events: [
        call("e-test-call", "execution:A", "bash", { command: "npm test" }, "call-1"),
        result("e-test-result", "execution:A", "call-1", false),
        // Same tool-call id reused in execution B for the edit; the
        // execution-A test result must not verify execution B's edit.
        { ...call("e-edit-call", "execution:B", "edit", { path: "src/a.ts" }, "call-1"), id: "e-edit-call" },
        { ...result("e-edit-result", "execution:B", "call-1", false), id: "e-edit-result" },
      ],
      diagnostics: [],
    };
    const context = extractObservedContext(multi);
    const handoff = buildHandoffFromWork(multi);

    expect(context.verification).toMatch(/not recorded after latest edit/i);
    expect(handoff.currentState).toMatch(/unverified|not recorded/i);
  });
});
