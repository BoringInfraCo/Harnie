import { describe, expect, it } from "vitest";
import { diffExecutions, executionEventCounts } from "../src/work/diff.js";
import type { NormalizedEventKind } from "../src/types.js";
import type { Work, WorkEvent } from "../src/work/types.js";

const workId = "work:diff:1";
const fromId = "exec-a";
const toId = "exec-b";

const event = (
  id: string,
  executionId: string,
  kind: NormalizedEventKind,
): WorkEvent => ({
  id,
  workId,
  executionId,
  kind,
  payload: {},
  provenance: { harness: "test", line: 1, observation: "observed" },
  diagnostics: [],
});

const buildWork = (): Work => ({
  id: workId,
  executions: [
    { id: fromId, workId, harness: "test", sourceSession: { harness: "test", sourceId: "sess-a" } },
    { id: toId, workId, harness: "test", sourceSession: { harness: "test", sourceId: "sess-b" } },
  ],
  events: [
    event("e-a1", fromId, "message"),
    event("e-a2", fromId, "tool_call"),
    event("e-a3", fromId, "tool_result"),
    event("e-b1", toId, "message"),
    event("e-b2", toId, "command"),
    event("e-b3", toId, "unknown"),
  ],
  diagnostics: [],
  decisions: [
    {
      id: "d-shared-a",
      summary: "Use postgres",
      evidence: ["e-a1"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
    {
      id: "d-shared-b",
      summary: "Use postgres",
      evidence: ["e-b1"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
    {
      id: "d-old",
      summary: "Use sqlite",
      evidence: ["e-a1"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
    {
      id: "d-old-dup",
      summary: "Use sqlite",
      evidence: ["e-a2"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
    {
      id: "d-new",
      summary: "Use mysql",
      evidence: ["e-b1"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
    {
      id: "d-ghost",
      summary: "Ghost decision",
      evidence: ["no-such-event"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
  ],
  findings: [
    {
      id: "f-shared-a",
      statement: "Latency is high",
      evidence: ["e-a3"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
    {
      id: "f-shared-b",
      statement: "Latency is high",
      evidence: ["e-b1"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
    {
      id: "f-old",
      statement: "Cache miss rate high",
      evidence: ["e-a1"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
    {
      id: "f-new",
      statement: "Disk usage high",
      evidence: ["e-b1"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
  ],
  nextSteps: [
    {
      id: "n-shared-a",
      description: "Verify migration",
      evidence: ["e-a1"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
    {
      id: "n-shared-b",
      description: "Verify migration",
      evidence: ["e-b1"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
    {
      id: "n-old",
      description: "Backfill data",
      evidence: ["e-a2"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
    {
      id: "n-new",
      description: "Update docs",
      evidence: ["e-b2"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
  ],
  operations: [
    {
      id: "o-shared-a",
      toolName: "read",
      path: "src/a.ts",
      status: "succeeded",
      evidence: ["e-a2"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
    {
      id: "o-shared-b",
      toolName: "read",
      path: "src/a.ts",
      status: "succeeded",
      evidence: ["e-b1"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
    {
      id: "o-old",
      toolName: "write",
      path: "src/old.ts",
      status: "succeeded",
      evidence: ["e-a2"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
    {
      id: "o-new",
      toolName: "bash",
      command: "npm test",
      status: "failed",
      evidence: ["e-b2"],
      provenance: { harness: "test", line: 1, observation: "derived" },
      rule: "test",
    },
  ],
});

describe("work diff", () => {
  it("counts events per execution", () => {
    const work = buildWork();
    expect(executionEventCounts(work, fromId)).toEqual({
      message: 1,
      tool_call: 1,
      tool_result: 1,
      command: 0,
      unknown: 0,
    });
    expect(executionEventCounts(work, toId)).toEqual({
      message: 1,
      tool_call: 0,
      tool_result: 0,
      command: 1,
      unknown: 1,
    });
  });

  it("partitions claims into kept/added/removed", () => {
    const diff = diffExecutions(buildWork(), fromId, toId);
    expect(diff.workId).toBe(workId);
    expect(diff.fromId).toBe(fromId);
    expect(diff.toId).toBe(toId);
    expect(diff.fromCounts).toEqual({
      message: 1,
      tool_call: 1,
      tool_result: 1,
      command: 0,
      unknown: 0,
    });
    expect(diff.toCounts).toEqual({
      message: 1,
      tool_call: 0,
      tool_result: 0,
      command: 1,
      unknown: 1,
    });
    expect(diff.keptDecisions).toEqual(["Use postgres"]);
    expect(diff.addedDecisions).toEqual(["Use mysql"]);
    expect(diff.removedDecisions).toEqual(["Use sqlite"]);
    expect(diff.keptFindings).toEqual(["Latency is high"]);
    expect(diff.addedFindings).toEqual(["Disk usage high"]);
    expect(diff.removedFindings).toEqual(["Cache miss rate high"]);
    expect(diff.keptNextSteps).toEqual(["Verify migration"]);
    expect(diff.addedNextSteps).toEqual(["Update docs"]);
    expect(diff.removedNextSteps).toEqual(["Backfill data"]);
    expect(diff.keptOperations).toEqual(["read src/a.ts — succeeded"]);
    expect(diff.addedOperations).toEqual(["bash npm test — failed"]);
    expect(diff.removedOperations).toEqual(["write src/old.ts — succeeded"]);
  });

  it("throws for unknown executions", () => {
    const work = buildWork();
    expect(() => executionEventCounts(work, "missing")).toThrow(/Execution not found/);
    expect(() => diffExecutions(work, "missing", toId)).toThrow(/Execution not found/);
    expect(() => diffExecutions(work, fromId, "missing")).toThrow(/Execution not found/);
  });

  it("diffs an execution with itself as all kept", () => {
    const work = buildWork();
    const diff = diffExecutions(work, fromId, fromId);
    expect(diff.keptDecisions).toEqual(expect.arrayContaining(["Use postgres", "Use sqlite"]));
    expect(diff.keptDecisions).toHaveLength(2);
    expect(diff.addedDecisions).toEqual([]);
    expect(diff.removedDecisions).toEqual([]);
    expect(diff.addedFindings).toEqual([]);
    expect(diff.removedFindings).toEqual([]);
    expect(diff.addedNextSteps).toEqual([]);
    expect(diff.removedNextSteps).toEqual([]);
    expect(diff.addedOperations).toEqual([]);
    expect(diff.removedOperations).toEqual([]);
    expect(diff.keptFindings).toHaveLength(2);
    expect(diff.keptNextSteps).toHaveLength(2);
    expect(diff.keptOperations).toHaveLength(2);
  });

  it("skips unattributed claims", () => {
    const diff = diffExecutions(buildWork(), fromId, toId);
    const all = [
      ...diff.keptDecisions,
      ...diff.addedDecisions,
      ...diff.removedDecisions,
      ...diff.keptFindings,
      ...diff.addedFindings,
      ...diff.removedFindings,
      ...diff.keptNextSteps,
      ...diff.addedNextSteps,
      ...diff.removedNextSteps,
      ...diff.keptOperations,
      ...diff.addedOperations,
      ...diff.removedOperations,
    ];
    expect(all).not.toContain("Ghost decision");
  });
});
