import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renderCodexHandoff } from "../src/handoff/codex.js";
import { renderOpenCodeHandoff } from "../src/handoff/opencode.js";
import { renderPiHandoff } from "../src/handoff/pi.js";
import {
  buildHandoffFromWork,
  formatEvidenceReference,
  formatOmittedMarker,
  HANDOFF_BUDGET_LIMITS,
  HANDOFF_EVIDENCE_REF_CAP,
  HANDOFF_PROTECTED_PRIORITY,
  type Handoff,
} from "../src/work/handoff.js";
import { initHarnieStore } from "../src/store/database.js";
import { importPiSessionFile } from "../src/engine/import.js";
import { loadWork } from "../src/store/persist.js";
import type { Decision, Finding, ToolOperation, Work } from "../src/work/types.js";

const WORK_ID = "work:synthetic:bounds";
const PROVENANCE = { harness: "synthetic", line: 1, observation: "derived" as const };
const FIXTURE_C = "tests/fixtures/pi/stateful-prefix.jsonl";

const emptyCounts = (): Handoff["eventCounts"] => ({
  message: 0,
  tool_call: 0,
  tool_result: 0,
  command: 0,
  unknown: 0,
});

const decision = (index: number, evidence?: readonly string[]): Decision => ({
  id: `decision:${index}`,
  summary: `decision ${index}: I will keep change ${index}`,
  evidence: evidence ?? [],
  provenance: PROVENANCE,
  rule: "assistant-intent",
});

const finding = (index: number): Finding => ({
  id: `finding:${index}`,
  statement: `finding ${index}`,
  evidence: [`event:${index}`],
  provenance: PROVENANCE,
  rule: "assistant-after-tool",
});

const toolOperation = (index: number): ToolOperation => {
  const pending = index === 7;
  const failed = !pending && index % 25 === 0;
  const read = index % 2 === 0;
  return {
    id: `operation:${index}`,
    toolName: read ? "read" : "edit",
    path: `src/file-${index}.ts`,
    status: pending ? "pending" : failed ? "failed" : "succeeded",
    ...(failed ? { note: "permission denied" } : read ? { note: "file contents" } : {}),
    evidence: [`event:${index}`],
    provenance: PROVENANCE,
    rule: "tool-activity",
  };
};

interface LongWorkOptions {
  readonly decisions?: number;
  readonly findings?: number;
  readonly operations?: number;
  readonly executions?: number;
}

const buildWork = (options: LongWorkOptions = {}): Work => {
  const count = (value: number | undefined, fallback: number): number => value ?? fallback;
  return {
    id: WORK_ID,
    workspace: { path: "/repo" },
    executions: Array.from({ length: count(options.executions, 1) }, (_, index) => ({
      id: `execution:synthetic:${index + 1}`,
      workId: WORK_ID,
      harness: "synthetic",
      sourceSession: { harness: "synthetic", sourceId: `sess-${index + 1}` },
    })),
    events: [],
    diagnostics: [],
    goal: {
      statement: "Ship the bounded handoff budget",
      evidence: ["event:0"],
      provenance: PROVENANCE,
      rule: "first-user-message",
    },
    decisions: Array.from({ length: count(options.decisions, 0) }, (_, index) => decision(index + 1)),
    findings: Array.from({ length: count(options.findings, 0) }, (_, index) => finding(index + 1)),
    operations: Array.from({ length: count(options.operations, 0) }, (_, index) => toolOperation(index + 1)),
  };
};

const LONG = buildWork({ decisions: 50, findings: 12, operations: 200, executions: 3 });

const isOmittedMarker = (item: string): boolean => /^\[\+\d+ more omitted\]$/.test(item);

const keptItems = (items: readonly string[]): readonly string[] => items.filter((item) => !isOmittedMarker(item));

const hasUnclosedRedactionMarker = (value: string): boolean => /\[REDACTED:[^\]]*…/.test(value);

describe("handoff size budget", () => {
  it("keeps a short work fully intact with zero omissions", () => {
    const handoff = buildHandoffFromWork(buildWork({ decisions: 2, operations: 3 }));

    expect(handoff.budget?.withinBudget).toBe(true);
    expect(Object.values(handoff.budget?.omittedItems ?? {}).every((count) => count === 0)).toBe(true);
    expect(handoff.budget?.omittedItems).toEqual({});
    expect(handoff.budget?.truncatedItems).toEqual({});
    expect(handoff.decisions.every((item) => !isOmittedMarker(item))).toBe(true);
    expect(handoff.operations.every((item) => !isOmittedMarker(item))).toBe(true);
    expect(handoff.goal).toBe("Ship the bounded handoff budget");
  });

  it("preserves FINDINGS_CAP=5 semantics and counts capped findings", () => {
    const handoff = buildHandoffFromWork(buildWork({ findings: 8 }));

    expect(handoff.findings).toEqual(["finding 4", "finding 5", "finding 6", "finding 7", "finding 8"]);
    expect(handoff.budget?.omittedItems.findings).toBe(3);
  });

  it("truncates long items with an explicit ellipsis and omitted-char count", () => {
    const work = buildWork({ decisions: 1 });
    const longSummary = "z".repeat(400);
    const withLong: Work = { ...work, decisions: [{ ...decision(1), summary: longSummary }] };

    const handoff = buildHandoffFromWork(withLong);

    expect(handoff.decisions[0]).toMatch(/… \[\+\d+ chars omitted\]$/);
    expect(handoff.decisions[0]?.length).toBeLessThanOrEqual(
      HANDOFF_BUDGET_LIMITS.itemChars + "… [+999 chars omitted]".length,
    );
    expect(handoff.budget?.truncatedItems.decisions).toBe(1);
  });

  it("never splits a [REDACTED:] marker when truncating", () => {
    const work = buildWork({ decisions: 1 });
    const markerFirst = `[REDACTED:api_key] ${"y".repeat(400)}`;
    const markerNearLimit = `${"y".repeat(230)} token=[REDACTED:api_key] tail ${"y".repeat(40)}`;
    const markerLongerThanLimit = `[REDACTED:${"x".repeat(300)}] tail`;

    for (const summary of [markerFirst, markerNearLimit, markerLongerThanLimit]) {
      const handoff = buildHandoffFromWork({
        ...work,
        decisions: [{ ...decision(1), summary }],
      });
      const item = handoff.decisions[0] ?? "";
      expect(hasUnclosedRedactionMarker(item)).toBe(false);
      const partial = /\[REDACTED:([a-z_]+)\]/.exec(item);
      if (item.includes("REDACTED")) {
        expect(partial?.[0]).toBe("[REDACTED:api_key]");
      }
    }
  });

  it("counts every omitted character exactly, including trimmed whitespace", () => {
    const work = buildWork({ decisions: 1 });
    const padded = `${"word ".repeat(60)}`; // 300 chars, cut lands on whitespace
    const handoff = buildHandoffFromWork({
      ...work,
      decisions: [{ ...decision(1), summary: padded }],
    });

    const item = handoff.decisions[0] ?? "";
    const omittedChars = Number.parseInt(/\[\+(\d+) chars omitted\]/.exec(item)?.[1] ?? "0", 10);
    const kept = item.replace(/… \[\+\d+ chars omitted\]$/, "");
    expect(kept.length + omittedChars).toBe(padded.length);
    expect(handoff.budget?.omittedChars.decisions).toBeGreaterThanOrEqual(omittedChars);
  });

  it("drops oldest section items first and reports the omitted count", () => {
    const handoff = buildHandoffFromWork(LONG);

    const marker = handoff.operations.find(isOmittedMarker);
    expect(marker).toBeDefined();
    const kept = keptItems(handoff.operations);
    expect(kept.length + (handoff.budget?.omittedItems.operations ?? 0)).toBe(200);
    expect(kept[0]).toMatch(/src\/file-\d+\.ts/);
    expect(Number.parseInt(/\d+/.exec(marker ?? "")?.[0] ?? "0", 10)).toBe(200 - kept.length);
    // Most recent operations survive; the oldest are omitted.
    expect(kept[kept.length - 1]).toContain("src/file-200.ts");
    expect(kept[0]).not.toContain("src/file-1.ts");
  });

  it("stays under the total budget with correct omitted counts at benchmark scale", () => {
    const handoff = buildHandoffFromWork(LONG);
    const budget = handoff.budget;

    expect(budget).toBeDefined();
    expect(budget?.boundedChars).toBeLessThanOrEqual(HANDOFF_BUDGET_LIMITS.totalChars);
    expect(budget?.withinBudget).toBe(true);

    const original: Record<string, number> = {
      decisions: 50,
      findings: 12,
      operations: 200,
    };
    for (const [key, count] of Object.entries(original)) {
      const kept = keptItems(handoff[key as "decisions" | "findings" | "operations"] as readonly string[]).length;
      expect(kept + (budget?.omittedItems[key] ?? 0)).toBe(count);
    }
  });

  it("applies the documented priority order when over the total budget", () => {
    const handoff = buildHandoffFromWork(LONG);
    const omitted = handoff.budget?.omittedItems ?? {};

    // Tier 4 lowest priorities drop first: readYields, failedApproaches, then changedFiles.
    expect(handoff.readYields?.every(isOmittedMarker) ?? false).toBe(true);
    expect(handoff.failedApproaches?.every(isOmittedMarker) ?? false).toBe(true);
    expect(handoff.changedFiles?.every(isOmittedMarker) ?? false).toBe(true);
    expect(omitted.readYields).toBeGreaterThan(0);
    expect(omitted.failedApproaches).toBeGreaterThan(0);
    expect(omitted.changedFiles).toBeGreaterThan(0);
    // Lower numeric priority (kept longer) survives before higher.
    expect(keptItems(handoff.relevantFiles ?? []).length).toBeGreaterThan(0);
    expect(keptItems(handoff.decisions).length).toBeGreaterThan(0);
    expect(keptItems(handoff.operations).length).toBeGreaterThan(0);
    // Tier 3 (test state) and tiers 1-2 are never dropped.
    expect(handoff.goal).toBe("Ship the bounded handoff budget");
    expect(handoff.currentState).toMatch(/Unresolved/);
    expect(handoff.unresolved).toMatch(/pending/);
    expect(keptItems(handoff.nextSteps).length).toBeGreaterThan(0);
  });

  it("caps multi-execution works deterministically with an omitted count", () => {
    const work = buildWork({ executions: 5 });
    const handoff = buildHandoffFromWork(work);

    expect(handoff.executions).toHaveLength(3);
    expect(handoff.executions?.map((execution) => execution.sourceId)).toEqual(["sess-3", "sess-4", "sess-5"]);
    expect(handoff.budget?.omittedItems.executions).toBe(2);
  });

  it("is byte-deterministic for the same Work, including renderers", () => {
    const first = buildHandoffFromWork(LONG);
    const second = buildHandoffFromWork(LONG);

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(renderOpenCodeHandoff(first)).toBe(renderOpenCodeHandoff(second));
    expect(renderPiHandoff(first)).toBe(renderPiHandoff(second));
    expect(renderCodexHandoff(first)).toBe(renderCodexHandoff(second));
  });

  it("formats evidence references with a cap and +N more", () => {
    expect(formatEvidenceReference(["event:1", "event:2", "event:3", "event:4", "event:5"])).toBe(
      "(evidence: event:1, event:2, event:3, +2 more)",
    );
    expect(formatEvidenceReference(["event:1"])).toBe("(evidence: event:1)");
    expect(formatEvidenceReference([])).toBeUndefined();
    expect(formatEvidenceReference(undefined)).toBeUndefined();
    expect(HANDOFF_EVIDENCE_REF_CAP).toBe(3);
  });

  it("attaches capped evidence references to decisions, findings, and next steps", () => {
    const work: Work = {
      ...buildWork({ decisions: 1, findings: 1 }),
      decisions: [decision(1, ["event:1", "event:2", "event:3", "event:4", "event:5"])],
      nextSteps: [
        {
          id: "step:1",
          description: "Rerun the failing test",
          evidence: ["event:90", "event:91", "event:92", "event:93", "event:94"],
          provenance: PROVENANCE,
          rule: "assistant-intent",
        },
      ],
    };

    const handoff = buildHandoffFromWork(work);

    expect(handoff.evidenceRefs?.decisions?.[0]).toEqual(["event:1", "event:2", "event:3", "event:4", "event:5"]);
    expect(handoff.evidenceRefs?.findings?.[0]).toEqual(["event:1"]);
    expect(handoff.evidenceRefs?.nextSteps?.[0]).toEqual(["event:90", "event:91", "event:92", "event:93", "event:94"]);

    for (const markdown of [
      renderOpenCodeHandoff(handoff),
      renderPiHandoff(handoff),
      renderCodexHandoff(handoff),
    ]) {
      expect(markdown).toContain("(evidence: event:1, event:2, event:3, +2 more)");
      expect(markdown).toContain("(evidence: event:1)");
      expect(markdown).toContain("(evidence: event:90, event:91, event:92, +2 more)");
    }
  });

  it("omits evidence references when no evidence ids exist", () => {
    const markdown = renderOpenCodeHandoff(buildHandoffFromWork(buildWork({ decisions: 2 })));

    expect(markdown).not.toContain("(evidence:");
  });

  it("does not misattribute pending-operation evidence to synthetic continuation lines", () => {
    const work: Work = {
      ...buildWork({ operations: 8 }),
      goal: {
        statement: "Investigate the failure, then propose a follow-up plan.",
        evidence: ["event:goal"],
        provenance: PROVENANCE,
        rule: "first-user-message",
      },
      nextSteps: [{ id: "step:blank", description: "   ", evidence: ["event:99"], provenance: PROVENANCE, rule: "assistant-intent" }],
    };

    const handoff = buildHandoffFromWork(work);

    expect(handoff.nextSteps.join("\n")).toMatch(/propose/i);
    expect(handoff.evidenceRefs?.nextSteps).toHaveLength(2);
    expect(handoff.evidenceRefs?.nextSteps?.[0]).toEqual(["event:99"]);
    expect(handoff.evidenceRefs?.nextSteps?.[1]).toBeUndefined();
  });

  it("renders the same omitted markers through all three receivers", () => {
    const handoff = buildHandoffFromWork(LONG);
    const markers = [
      ...(handoff.decisions ?? []),
      ...(handoff.operations ?? []),
      ...(handoff.readYields ?? []),
      ...(handoff.changedFiles ?? []),
    ].filter(isOmittedMarker);

    expect(markers.length).toBeGreaterThan(0);
    for (const markdown of [
      renderOpenCodeHandoff(handoff),
      renderPiHandoff(handoff),
      renderCodexHandoff(handoff),
    ]) {
      for (const marker of markers) {
        expect(markdown).toContain(`- ${marker}`);
      }
    }
  });

  it("preserves unresolved and uncertainty first at maximum truncation", () => {
    const handoff = buildHandoffFromWork(LONG);

    expect(handoff.unresolved).toBe("pending edit src/file-7.ts");
    expect(handoff.currentState).toBe("Unresolved: pending edit src/file-7.ts");
    expect(handoff.nextSteps[0]).toBe("Complete pending tool call edit src/file-7.ts");
    expect(handoff.budget?.omittedItems.unresolved ?? 0).toBe(0);
    expect(handoff.budget?.omittedItems.currentState ?? 0).toBe(0);
    expect(HANDOFF_PROTECTED_PRIORITY).toBe(2);
  });

  it("renders explicit truncation markers for dropped single-line sections", () => {
    const handoff = buildHandoffFromWork(LONG);
    const markdown = renderOpenCodeHandoff(handoff);

    if ((handoff.budget?.omittedItems.changedFiles ?? 0) > 0) {
      expect(markdown).toMatch(/## Changed files\n- \[\+\d+ more omitted\]/);
    }
    expect(formatOmittedMarker(0)).toBeUndefined();
    expect(formatOmittedMarker(4)).toBe("[+4 more omitted]");
  });

  it("benchmarks fixture-scale vs synthetic-long packages", async () => {
    const home = await mkdtemp(join(tmpdir(), "harnie-handoff-bounds-"));
    const store = initHarnieStore({ home });
    try {
      const result = await importPiSessionFile(store, FIXTURE_C);
      const loaded = loadWork(store, result.workId);
      const fixtureHandoff = buildHandoffFromWork(loaded as Work);
      const fixtureJson = JSON.stringify(fixtureHandoff).length;
      const fixtureMd = renderOpenCodeHandoff(fixtureHandoff).length;

      const longHandoff = buildHandoffFromWork(LONG);
      const longJson = JSON.stringify(longHandoff).length;
      const longMd = renderOpenCodeHandoff(longHandoff).length;

      console.info(
        `[handoff-bounds benchmark] fixture-scale: json=${fixtureJson} chars, markdown=${fixtureMd} chars | ` +
          `synthetic-long (50 decisions, 200 operations, 3 executions): ` +
          `json=${longJson} chars, markdown=${longMd} chars, ` +
          `boundedContent=${longHandoff.budget?.boundedChars} chars ` +
          `withinBudget=${String(longHandoff.budget?.withinBudget)}`,
      );

      expect(longHandoff.budget?.boundedChars ?? 0).toBeLessThanOrEqual(HANDOFF_BUDGET_LIMITS.totalChars);
      expect(longMd).toBeLessThan(8000);
      expect(fixtureHandoff.budget?.withinBudget).toBe(true);
      expect(longMd).toBeGreaterThan(fixtureMd);
    } finally {
      store.close();
      await rm(home, { recursive: true, force: true });
    }
  });
});
