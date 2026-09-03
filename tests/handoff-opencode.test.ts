import { describe, expect, it } from "vitest";
import { renderOpenCodeHandoff } from "../src/handoff/opencode.js";
import type { Handoff } from "../src/work/handoff.js";

const emptyCounts = (): Handoff["eventCounts"] => ({
  message: 0,
  tool_call: 0,
  tool_result: 0,
  command: 0,
  unknown: 0,
});

describe("renderOpenCodeHandoff", () => {
  it("renders a compact continuation with goal and decision, omitting empty next steps", () => {
    const markdown = renderOpenCodeHandoff({
      workId: "work:pi:fixture-c",
      goal: "Extend xhigh to 5.3",
      decisions: ["I will update that predicate"],
      findings: [],
      nextSteps: [],
      operations: [],
      filesTouched: [],
      eventCounts: emptyCounts(),
      diagnosticCodes: [],
      provenance: { from: "work" },
    });

    expect(markdown).toMatch(/Continue/);
    expect(markdown).toMatch(/5\.3|xhigh/);
    expect(markdown).toMatch(/I will/);
    expect(markdown).not.toMatch(/## Next steps/i);
    expect(markdown.length).toBeLessThan(8000);
  });

  it("renders a Trace B-like unfinished handoff without claiming completion", () => {
    const markdown = renderOpenCodeHandoff({
      workId: "work:pi:harnie-tb-da82c4f8",
      goal: "Investigate this project thoroughly",
      currentState: "Unresolved: Complete pending tool call read",
      nextSteps: ["Complete pending tool call read"],
      decisions: [],
      findings: [],
      operations: [],
      filesTouched: [],
      eventCounts: {
        message: 4,
        tool_call: 6,
        tool_result: 5,
        command: 0,
        unknown: 0,
      },
      diagnosticCodes: ["missing_tool_result"],
      provenance: {
        from: "work",
        sourceHarness: "pi",
        sourceSession: "harnie-tb-da82c4f8",
      },
    });

    expect(markdown).toMatch(/pending/i);
    expect(markdown).toMatch(/\bread\b/i);
    expect(markdown).not.toMatch(/complete the investigation/i);
    expect(markdown.length).toBeLessThan(8000);
  });
});
