import { describe, expect, it } from "vitest";
import { deriveObservedWork } from "../src/work/derive.js";
import { buildHandoffFromWork } from "../src/work/handoff.js";
import type { Work, WorkEvent } from "../src/work/types.js";

const event = (id: string, executionId: string, kind: WorkEvent["kind"], payload: WorkEvent["payload"]): WorkEvent => ({
  id, executionId, workId: "work", kind, payload,
  provenance: { harness: "pi", line: 1, observation: "observed" }, diagnostics: [],
});
const call = (id: string, executionId: string, toolName: string, args: WorkEvent["payload"]) =>
  event(id, executionId, "tool_call", { toolCallId: id, toolName, arguments: args });
const result = (id: string, executionId: string, callId: string, isError = false) =>
  event(id, executionId, "tool_result", { toolCallId: callId, isError });
const work = (events: WorkEvent[]): Work => ({ id: "work", executions: [], diagnostics: [], events });

describe("execution-scoped correlation", () => {
  it("keeps reused IDs isolated in operations, pending steps, and handoff fallback", () => {
    const a = call("shared", "A", "read", { path: "a.ts" });
    const b = { ...call("shared", "B", "read", { path: "b.ts" }), id: "b-call" };
    const c = { ...call("shared", "C", "read", { path: "c.ts" }), id: "c-call" };
    const observed = work([a, b, result("b-result", "B", "shared"), c, result("c-result", "C", "shared", true)]);
    const derived = deriveObservedWork(observed);
    expect(derived.operations?.map(op => op.status)).toEqual(["pending", "succeeded", "failed"]);
    expect(derived.operations?.map(op => op.evidence)).toEqual([["shared"], ["b-call", "b-result"], ["c-call", "c-result"]]);
    expect(derived.nextSteps?.map(step => step.description)).toEqual(["Complete pending tool call read a.ts"]);
    expect(buildHandoffFromWork(observed).operations).toEqual(["read a.ts — pending", "read b.ts — succeeded", "read c.ts — failed"]);
  });

  it("lets a matching result supersede obsolete missing-result diagnostics", () => {
    const pending = { ...call("read", "A", "read", { path: "a.ts" }), diagnostics: [{ code: "missing_tool_result", message: "pending", severity: "warning" as const, location: {} }] };
    const derived = deriveObservedWork(work([pending, result("done", "A", "read")]));
    expect(derived.operations?.[0]?.status).toBe("succeeded");
    expect(derived.nextSteps).toBeUndefined();
    expect(buildHandoffFromWork(derived).currentState).toBeUndefined();
  });
});

describe("verification at the latest edit watermark", () => {
  const edit = () => [call("edit", "A", "edit", { path: "a.ts" }), result("edited", "A", "edit")];
  const test = (isError = false, executionId = "A") => [call("test", executionId, "bash", { command: "npm test" }), result("tested", executionId, "test", isError)];
  const handoff = (events: WorkEvent[]) => buildHandoffFromWork(deriveObservedWork(work(events)));

  it("requires fresh verification when successful tests precede edits", () => {
    const output = handoff([...test(), ...edit()]);
    expect(output.testState).toContain("current edits unverified");
    expect(output.currentState).toContain("Verification not recorded after latest edit");
    expect(output.unresolved).toContain("after latest edit");
    expect(output.nextSteps.join(" ")).toContain("Verify the edits on a.ts");
    expect(output.evidence).toEqual(expect.arrayContaining(["edit", "edited", "test", "tested"]));
  });

  it("reports successful post-edit tests consistently", () => {
    const output = handoff([...edit(), ...test()]);
    expect(output.testState).toBe("npm test — succeeded");
    expect(output.currentState).toContain("Verification succeeded after latest edit");
    expect(output.unresolved).toBeUndefined();
    expect(output.nextSteps).toEqual([]);
  });

  it("asks to investigate and rerun failed post-edit tests", () => {
    const output = handoff([...edit(), ...test(true)]);
    expect(output.currentState).toContain("Verification failed after latest edit");
    expect(output.unresolved).toBe("Verification failed after latest edit");
    expect(output.nextSteps.join(" ")).toContain("Investigate the failed verification and rerun tests");
  });

  it("keeps post-edit tests pending until results arrive", () => {
    const output = handoff([...edit(), call("test", "A", "bash", { command: "npm test" })]);
    expect(output.testState).toBe("npm test — pending");
    expect(output.currentState).toContain("pending bash npm test");
    expect(output.nextSteps.join(" ")).toContain("Complete pending tool call bash");
  });

  it("does not verify an edit with another execution's tests", () => {
    const output = handoff([...edit(), ...test(false, "B")]);
    expect(output.testState).toContain("different execution");
    expect(output.nextSteps.join(" ")).toContain("Verify the edits");
  });

  it("does not infer cross-execution revision order from import order", () => {
    const output = handoff([
      call("b-edit", "B", "edit", { path: "b.ts" }), result("b-edited", "B", "b-edit"),
      ...edit(), ...test(),
    ]);
    expect(output.testState).toContain("edits span executions");
    expect(output.nextSteps.join(" ")).toContain("Verify the edits");
  });

  it("does not verify with a test started before an edit completed", () => {
    const edits = edit();
    const tests = test();
    const output = handoff([edits[0]!, tests[0]!, edits[1]!, tests[1]!]);
    expect(output.testState).toContain("current edits unverified");
    expect(output.nextSteps.join(" ")).toContain("Verify the edits");
  });

  it("invalidates verification after another successful edit", () => {
    const output = handoff([...edit(), ...test(), call("second", "A", "write", { path: "b.ts" }), result("second-result", "A", "second")]);
    expect(output.nextSteps.join(" ")).toContain("Verify the edits on a.ts, b.ts");
    expect(output.testState).toContain("current edits unverified");
  });
});
