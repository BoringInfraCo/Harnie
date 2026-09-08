import { describe, expect, it } from "vitest";
import { deriveObservedWork } from "../src/work/derive.js";
import { extractToolOperations } from "../src/work/operations.js";
import type { Work, WorkEvent } from "../src/work/types.js";

// Finding 4 (audit lines 84-88): tool-result matching was not scoped to the
// execution. Audit repro at the Work boundary: a call in execution A with ID
// `call-1` plus a successful result in execution B with the same ID made A's
// operation appear successful, because the result index keyed on call ID only
// across the whole Work. Correlation must use execution identity plus
// tool-call identity.
const event = (
  id: string,
  executionId: string,
  kind: WorkEvent["kind"],
  payload: WorkEvent["payload"],
): WorkEvent => ({
  id,
  executionId,
  workId: "work",
  kind,
  payload,
  provenance: { harness: "pi", line: 1, observation: "observed" },
  diagnostics: [],
});

const call = (id: string, executionId: string, path: string, toolCallId = "call-1") =>
  event(id, executionId, "tool_call", { toolCallId, toolName: "read", arguments: { path } });

const result = (id: string, executionId: string, toolCallId = "call-1", isError = false) =>
  event(id, executionId, "tool_result", { toolCallId, isError });

const work = (events: WorkEvent[]): Work => ({
  id: "work",
  executions: [
    { id: "A", workId: "work", harness: "pi", sourceSession: { harness: "pi", sourceId: "s-a" } },
    { id: "B", workId: "work", harness: "pi", sourceSession: { harness: "pi", sourceId: "s-b" } },
    { id: "C", workId: "work", harness: "pi", sourceSession: { harness: "pi", sourceId: "s-c" } },
  ],
  events,
  diagnostics: [],
});

describe("finding 4: tool results correlate within their execution", () => {
  it("does not let another execution's success resolve this execution's call", () => {
    const observed = work([call("a-call", "A", "a.ts"), result("b-result", "B")]);
    const operations = extractToolOperations(observed);

    expect(operations).toHaveLength(1);
    expect(operations[0]?.path).toBe("a.ts");
    expect(operations[0]?.status).toBe("pending");
    expect(operations[0]?.evidence).toEqual(["a-call"]);

    const derived = deriveObservedWork(observed);
    expect(derived.nextSteps?.map((step) => step.description))
      .toEqual(["Complete pending tool call read a.ts"]);
  });

  it("keeps reused IDs isolated with opposing outcomes and unresolved calls", () => {
    const observed = work([
      call("a-call", "A", "a.ts"),
      call("b-call", "B", "b.ts"),
      result("b-result", "B"),
      call("c-call", "C", "c.ts"),
      result("c-result", "C", "call-1", true),
    ]);
    const operations = extractToolOperations(observed);

    expect(operations.map((op) => op.status)).toEqual(["pending", "succeeded", "failed"]);
    expect(operations.map((op) => op.evidence)).toEqual([
      ["a-call"],
      ["b-call", "b-result"],
      ["c-call", "c-result"],
    ]);

    const derived = deriveObservedWork(observed);
    expect(derived.nextSteps?.map((step) => step.description))
      .toEqual(["Complete pending tool call read a.ts"]);
  });

  it("leaves calls without a resolvable result pending and ignores orphan results", () => {
    const orphan = event("orphan-result", "B", "tool_result", { toolCallId: "no-such-call", isError: false });
    const unkeyed = event("unkeyed-call", "A", "tool_call", { toolName: "read", arguments: { path: "d.ts" } });
    const observed = work([call("a-call", "A", "a.ts"), orphan, unkeyed]);
    const operations = extractToolOperations(observed);

    expect(operations.map((op) => op.status)).toEqual(["pending", "pending"]);
    expect(deriveObservedWork(observed).nextSteps).toHaveLength(2);
  });
});
