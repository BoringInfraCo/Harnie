import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CLI_JSON_SCHEMA } from "../src/contract/envelope.js";
import { runDiff } from "../src/cli/diff.js";
import { runExecutions } from "../src/cli/executions.js";
import { runHandoff } from "../src/cli/handoff.js";
import { runHistory } from "../src/cli/history.js";
import { runImport } from "../src/cli/import.js";
import { runList } from "../src/cli/list.js";
import { runSessions } from "../src/cli/sessions.js";
import { runShow } from "../src/cli/show.js";
import { importPiSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";
import { loadWork, persistObservedWork } from "../src/store/persist.js";
import { readPiJsonlFile } from "../src/pi/reader.js";
import { observePiSession } from "../src/pi/observe.js";
import type { JsonEnvelope } from "../src/contract/envelope.js";

const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";
const FIXTURE_C = "tests/fixtures/pi/stateful-prefix.jsonl";
const CODEX = "tests/fixtures/codex/unfinished-read.jsonl";

const capture = () => {
  let output = "";
  return {
    write(chunk: string) {
      output += chunk;
    },
    toString() {
      return output;
    },
  };
};

describe("machine contract: --json envelopes", () => {
  const homes: string[] = [];

  const makeHome = (): string => {
    const home = mkdtempSync(join(tmpdir(), "harnie-contract-json-"));
    homes.push(home);
    return home;
  };

  afterEach(() => {
    for (const home of homes.splice(0)) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  const seed = async (home: string, path: string): Promise<string> => {
    const store = initHarnieStore({ home });
    try {
      return (await importPiSessionFile(store, path)).workId;
    } finally {
      store.close();
    }
  };

  const seedTwoExecutions = async (home: string): Promise<{ workId: string; a: string; b: string }> => {
    const store = initHarnieStore({ home });
    try {
      const { importCodexSessionFile } = await import("../src/engine/import.js");
      const pi = await importPiSessionFile(store, TRACE_B);
      await importCodexSessionFile(store, CODEX, { workId: pi.workId });
      const work = loadWork(store, pi.workId);
      const ids = (work?.executions ?? []).map((execution) => execution.id);
      return { workId: pi.workId, a: ids[0] ?? "", b: ids[ids.length - 1] ?? "" };
    } finally {
      store.close();
    }
  };

  const parseEnvelope = (output: string): JsonEnvelope => {
    expect(output.endsWith("\n")).toBe(true);
    return JSON.parse(output) as JsonEnvelope;
  };

  it("pins the schema version on every envelope", () => {
    expect(CLI_JSON_SCHEMA).toBe("harnie.cli.v1");
  });

  it("list --json returns summary rows in a stable envelope", async () => {
    const home = makeHome();
    await seed(home, TRACE_B);
    const stdout = capture();

    const code = await runList(["--json"], { home, stdout, stderr: capture() });
    const envelope = parseEnvelope(stdout.toString());

    expect(code).toBe(0);
    expect(Object.keys(envelope)).toEqual(["schema", "command", "ok", "data"]);
    expect(envelope.schema).toBe("harnie.cli.v1");
    if (envelope.ok !== true) throw new Error("expected success envelope");
    expect(envelope.command).toBe("list");
    const works = (envelope.data as { works: unknown[] }).works;
    expect(works).toHaveLength(1);
    expect(Object.keys(works[0] as object)).toEqual([
      "id",
      "workspacePath",
      "harness",
      "provider",
      "model",
      "updatedAt",
      "eventCount",
    ]);
  });

  it("list --json on an empty store reports an empty array, not prose", async () => {
    const home = makeHome();
    initHarnieStore({ home }).close();
    const stdout = capture();

    const code = await runList(["--json"], { home, stdout, stderr: capture() });

    expect(code).toBe(0);
    const envelope = parseEnvelope(stdout.toString());
    if (envelope.ok !== true) throw new Error("expected success envelope");
    expect(envelope.data).toEqual({ works: [] });
  });

  it("show --json returns observed work, derived sections, and explicit budget", async () => {
    const home = makeHome();
    await seed(home, TRACE_B);
    const stdout = capture();

    const code = await runShow(["work:pi:harnie-tb-da82c4f8", "--json"], { home, stdout, stderr: capture() });
    const envelope = parseEnvelope(stdout.toString());

    expect(code).toBe(0);
    if (envelope.ok !== true) throw new Error("expected success envelope");
    expect(envelope.command).toBe("show");
    const data = envelope.data as {
      work: { id: string; executions: unknown[]; decisions: unknown[] };
      derived: {
        findings: unknown[];
        nextSteps: unknown[];
        budget: { limits: unknown; omittedItems: Record<string, number> };
        evidenceRefs: unknown;
      };
      eventCounts: Record<string, number>;
      diagnosticCodes: string[];
      provenance: string;
    };
    expect(data.work.id).toBe("work:pi:harnie-tb-da82c4f8");
    expect(data.work.executions.length).toBeGreaterThan(0);
    expect(data.derived.nextSteps.length).toBeGreaterThan(0);
    expect(data.derived.budget.limits).toEqual({ itemChars: 240, sectionChars: 1200, totalChars: 6000 });
    expect(data.derived.budget.omittedItems.findings ?? 0).toBe(0);
    expect(data.derived.evidenceRefs).toBeDefined();
    expect(data.eventCounts.tool_call).toBeGreaterThan(0);
    expect(data.diagnosticCodes).toContain("missing_tool_result");
    expect(data.provenance).toBe("observed");
  });

  it("executions --json returns per-execution event counts", async () => {
    const home = makeHome();
    await seed(home, TRACE_B);
    const stdout = capture();

    const code = await runExecutions(["work:pi:harnie-tb-da82c4f8", "--json"], { home, stdout, stderr: capture() });

    expect(code).toBe(0);
    const envelope = parseEnvelope(stdout.toString());
    if (envelope.ok !== true) throw new Error("expected success envelope");
    expect(envelope.command).toBe("executions");
    const data = envelope.data as { workId: string; executions: Array<{ id: string; eventCounts: Record<string, number>; eventCount: number }> };
    expect(data.workId).toBe("work:pi:harnie-tb-da82c4f8");
    expect(data.executions).toHaveLength(1);
    expect(data.executions[0]?.eventCounts.message).toBeGreaterThan(0);
    expect(data.executions[0]?.eventCount).toBeGreaterThan(0);
  });

  it("history --json returns executions, checkpoints, and claim lists", async () => {
    const home = makeHome();
    await seed(home, TRACE_B);
    const stdout = capture();

    const code = await runHistory(["work:pi:harnie-tb-da82c4f8", "--json"], { home, stdout, stderr: capture() });

    expect(code).toBe(0);
    const envelope = parseEnvelope(stdout.toString());
    if (envelope.ok !== true) throw new Error("expected success envelope");
    expect(envelope.command).toBe("history");
    const data = envelope.data as {
      workId: string;
      executions: unknown[];
      checkpoints: unknown[];
      decisions: string[];
      findings: string[];
      nextSteps: string[];
    };
    expect(data.workId).toBe("work:pi:harnie-tb-da82c4f8");
    expect(data.executions).toHaveLength(1);
    expect(data.checkpoints).toEqual([]);
    expect(data.nextSteps.length).toBeGreaterThan(0);
  });

  it("diff --json returns counts and kept/added/removed claim groups", async () => {
    const home = makeHome();
    const { workId, a, b } = await seedTwoExecutions(home);
    const stdout = capture();

    const code = await runDiff([workId, a, b, "--json"], { home, stdout, stderr: capture() });

    expect(code).toBe(0);
    const envelope = parseEnvelope(stdout.toString());
    if (envelope.ok !== true) throw new Error("expected success envelope");
    expect(envelope.command).toBe("diff");
    const data = envelope.data as {
      workId: string;
      fromId: string;
      toId: string;
      decisions: { kept: string[]; added: string[]; removed: string[] };
    };
    expect(data.workId).toBe(workId);
    expect(data.fromId).toBe(a);
    expect(data.toId).toBe(b);
    expect(Object.keys(data.decisions)).toEqual(["kept", "added", "removed"]);
  });

  it("handoff --json emits the sections list, budget, and file path — not markdown", async () => {
    const home = makeHome();
    await seed(home, TRACE_B);
    const stdout = capture();

    const code = await runHandoff(["work:pi:harnie-tb-da82c4f8", "--to", "opencode", "--json"], {
      home,
      stdout,
      stderr: capture(),
    });
    const envelope = parseEnvelope(stdout.toString());

    expect(code).toBe(0);
    if (envelope.ok !== true) throw new Error("expected success envelope");
    expect(envelope.command).toBe("handoff");
    const data = envelope.data as {
      workId: string;
      target: string;
      file: string;
      sections: { findings: string[]; nextSteps: string[] };
      budget: { limits: unknown; omittedItems: Record<string, number>; withinBudget: boolean };
      eventCounts: Record<string, number>;
    };
    expect(data.workId).toBe("work:pi:harnie-tb-da82c4f8");
    expect(data.target).toBe("opencode");
    expect(data.sections.nextSteps.length).toBeGreaterThan(0);
    expect(data.budget.withinBudget).toBe(true);
    expect(data.budget.omittedItems.findings ?? 0).toBe(0);
    expect(stdout.toString()).not.toMatch(/continue this work/i);
    expect(existsSync(data.file)).toBe(true);
    expect(data.file.endsWith(".md")).toBe(true);
  });

  it("handoff --json reports truncated findings explicitly through the budget", async () => {
    const home = makeHome();
    const store = initHarnieStore({ home });
    let workId = "";
    try {
      const observed = observePiSession(await readPiJsonlFile(FIXTURE_C));
      const provenance = { harness: "pi", line: 1, observation: "derived" as const };
      const findings = Array.from({ length: 7 }, (_item, index) => ({
        id: `finding:cap:${index}`,
        statement: `Observed finding number ${index}.`,
        evidence: [observed.events[0]?.id ?? "event:1"],
        provenance,
        rule: "test.cap",
      }));
      persistObservedWork(store, { ...observed, findings });
      workId = observed.id;
    } finally {
      store.close();
    }
    const stdout = capture();

    const code = await runHandoff([workId, "--to", "opencode", "--json"], { home, stdout, stderr: capture() });
    const envelope = parseEnvelope(stdout.toString());

    expect(code).toBe(0);
    if (envelope.ok !== true) throw new Error("expected success envelope");
    const data = envelope.data as {
      sections: { findings: string[] };
      budget: { limits: { itemChars: number }; omittedItems: Record<string, number>; omittedChars: Record<string, number> };
    };
    expect(data.sections.findings).toHaveLength(5);
    expect(data.budget.omittedItems.findings).toBe(2);
    expect(data.budget.omittedChars.findings ?? 0).toBeGreaterThan(0);
    expect(data.budget.limits.itemChars).toBe(240);
  });

  it("sessions --json returns structured scans with omission counts", async () => {
    const stdout = capture();
    const code = await runSessions(["--json"], { stdout, stderr: capture(), env: process.env });

    expect(code).toBe(0);
    const envelope = parseEnvelope(stdout.toString());
    if (envelope.ok !== true) throw new Error("expected success envelope");
    expect(envelope.command).toBe("sessions");
    const data = envelope.data as {
      scans: Array<{ harness: string; locations: string[]; omitted: number; sessions: unknown[] }>;
    };
    expect(data.scans.map((scan) => scan.harness)).toEqual(["pi", "opencode", "codex"]);
    for (const scan of data.scans) {
      expect(scan.omitted).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(scan.sessions)).toBe(true);
    }
  });

  it("json output is deterministic: identical input yields byte-identical stdout", async () => {
    const home = makeHome();
    await seed(home, TRACE_B);
    const run = (): Promise<string> => {
      const stdout = capture();
      return runShow(["work:pi:harnie-tb-da82c4f8", "--json"], { home, stdout, stderr: capture() }).then(
        () => stdout.toString(),
      );
    };
    const first = await run();
    const second = await run();
    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);
  });

  it("text mode is unchanged: empty list prints the exact line", async () => {
    const home = makeHome();
    initHarnieStore({ home }).close();
    const stdout = capture();
    const stderr = capture();

    const code = await runList([], { home, stdout, stderr });

    expect(code).toBe(0);
    expect(stdout.toString()).toBe("No observed work.\n");
    expect(stderr.toString()).toBe("");
  });

  it("text mode is unchanged: show keeps the exact sectioned format", async () => {
    const home = makeHome();
    await seed(home, TRACE_B);
    const stdout = capture();
    const stderr = capture();

    const code = await runShow(["work:pi:harnie-tb-da82c4f8"], { home, stdout, stderr });
    const output = stdout.toString();

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(output).toContain("/workspace/pi-project");
    expect(output).toMatch(/\bGoal\b/);
    expect(output).toMatch(/\bNext\b/);
    expect(output).not.toMatch(/\bDecisions\b/);
    expect(output.endsWith("\n")).toBe(true);
  });

  it("importing after a --json command still prints the same text summary", async () => {
    const home = makeHome();
    const stdout = capture();

    const code = await runImport(["pi", TRACE_B], { home, stdout, stderr: capture() });

    expect(code).toBe(0);
    expect(stdout.toString()).toBe(
      "Imported pi session.\n\nWork\nwork:pi:harnie-tb-da82c4f8\nEvents inserted\n18\n",
    );
  });
});
