import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importCodexSessionFile, importPiSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";
import { loadWork } from "../src/store/persist.js";
import { buildHandoffFromWork } from "../src/work/handoff.js";
import type { Work } from "../src/work/types.js";

const FIXTURE_C = "tests/fixtures/pi/stateful-prefix.jsonl";
const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";
const CODEX = "tests/fixtures/codex/unfinished-read.jsonl";

describe("handoff observed operations", () => {
  const homes: string[] = [];

  const makeStore = async () => {
    const home = await mkdtemp(join(tmpdir(), "harnie-handoff-ops-"));
    homes.push(home);
    return initHarnieStore({ home });
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("names Fixture C successful edits so continuation does not re-do them", async () => {
    const store = await makeStore();
    try {
      const result = await importPiSessionFile(store, FIXTURE_C);
      const loaded = loadWork(store, result.workId);
      expect(loaded).toBeDefined();
      const handoff = buildHandoffFromWork(loaded as Work);
      const operations = handoff.operations.join("\n");
      const files = handoff.filesTouched.join("\n");
      const blob = `${operations}\n${files}`;

      expect(blob).toContain("packages/ai/src/models.ts");
      expect(blob).toContain("packages/agent/src/types.ts");
      expect(operations).toMatch(/edit .*packages\/ai\/src\/models\.ts — succeeded/);
      expect(operations).toMatch(/edit .*packages\/agent\/src\/types\.ts — succeeded/);
      expect(handoff.changedFiles?.join("\n")).toContain("packages/ai/src/models.ts");
      expect(handoff.changedFiles?.join("\n")).toContain("packages/agent/src/types.ts");
      expect(handoff.currentState).toMatch(/success|already edited/i);
      expect(handoff.currentState).toMatch(/models\.ts/);
      expect(handoff.currentState).not.toMatch(/not yet edited|still need to edit|re-?do the edits/i);
    } finally {
      store.close();
    }
  });

  it("lists Trace B files already read and the pending .git/config path", async () => {
    const store = await makeStore();
    try {
      const result = await importPiSessionFile(store, TRACE_B);
      const loaded = loadWork(store, result.workId);
      expect(loaded).toBeDefined();
      const handoff = buildHandoffFromWork(loaded as Work);
      const operations = handoff.operations.join("\n");
      const files = handoff.filesTouched.join("\n");
      const blob = `${operations}\n${files}`;

      expect(blob).toContain("README.md");
      expect(blob).toContain("analysis.js");
      expect(blob).toContain("config.json");
      expect(blob).toContain(".git/config");
      expect(operations).toMatch(/read .*README\.md — succeeded/);
      expect(operations).toMatch(/read .*\.git\/config — pending/);
      expect(handoff.relevantFiles?.some((path) => path.endsWith("README.md"))).toBe(true);
      expect(handoff.relevantFiles?.some((path) => path.endsWith("analysis.js"))).toBe(true);
      expect(handoff.relevantFiles?.some((path) => path.endsWith("config.json"))).toBe(true);
      expect(handoff.relevantFiles?.some((path) => path.endsWith(".git/config"))).toBe(false);
      expect(handoff.revision).toBe("47da672");
      expect(handoff.readYields?.some((line) => line.includes("# Mystery Project"))).toBe(true);
      expect(handoff.currentState).toMatch(/unresolved|pending/i);
      expect(handoff.nextSteps.length).toBeGreaterThanOrEqual(1);
    } finally {
      store.close();
    }
  });

  it("names both pi and codex after attaching a Pi session onto Codex work", async () => {
    const store = await makeStore();
    try {
      const codex = await importCodexSessionFile(store, CODEX);
      await importPiSessionFile(store, TRACE_B, { workId: codex.workId });
      const loaded = loadWork(store, codex.workId);
      expect(loaded).toBeDefined();
      const handoff = buildHandoffFromWork(loaded as Work);
      const harnesses = [
        handoff.provenance.sourceHarness,
        ...(handoff.executions ?? []).map((execution) => execution.harness),
      ].join("\n");

      expect(harnesses).toMatch(/\bpi\b/);
      expect(harnesses).toMatch(/\bcodex\b/);
      expect(handoff.executions?.map((execution) => execution.harness)).toEqual(
        expect.arrayContaining(["pi", "codex"]),
      );
    } finally {
      store.close();
    }
  });
});
