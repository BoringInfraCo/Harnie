import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importGrokSessionPath, importPiSessionFile } from "../src/engine/import.js";
import { renderGrokHandoff } from "../src/handoff/grok.js";
import { initHarnieStore } from "../src/store/database.js";
import { loadWork } from "../src/store/persist.js";
import { buildHandoffFromWork, type Handoff } from "../src/work/handoff.js";
import type { Work } from "../src/work/types.js";

const GROK_FIXTURE = "tests/fixtures/grok/unfinished-demo";
const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";

const emptyCounts = (): Handoff["eventCounts"] => ({
  message: 0,
  tool_call: 0,
  tool_result: 0,
  command: 0,
  unknown: 0,
});

describe("renderGrokHandoff", () => {
  const homes: string[] = [];

  const makeStore = async () => {
    const home = await mkdtemp(join(tmpdir(), "harnie-handoff-grok-"));
    homes.push(home);
    return initHarnieStore({ home });
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("renders Grok-imported work as a Grok continuation, not session JSONL", async () => {
    const store = await makeStore();
    try {
      const result = await importGrokSessionPath(store, GROK_FIXTURE);
      const loaded = loadWork(store, result.workId);
      expect(loaded).toBeDefined();
      const handoff = buildHandoffFromWork(loaded as Work);
      const markdown = renderGrokHandoff(handoff);

      expect(markdown).toMatch(/for Grok/);
      expect(markdown).toMatch(/Continue/);
      expect(markdown).toMatch(/demo video catalog/i);
      expect(markdown).not.toMatch(/"tool_calls"/);
      expect(markdown).not.toMatch(/secretly rewrite/i);
      // Pending Catalog.tsx edit keeps work unresolved.
      expect(markdown).toMatch(/Catalog\.tsx|Unresolved|pending/i);
    } finally {
      store.close();
    }
  });

  it("keeps Trace B unresolved without claiming investigation complete", async () => {
    const store = await makeStore();
    try {
      const result = await importPiSessionFile(store, TRACE_B);
      const loaded = loadWork(store, result.workId);
      expect(loaded).toBeDefined();
      const handoff = buildHandoffFromWork(loaded as Work);
      const markdown = renderGrokHandoff(handoff);

      expect(markdown).toMatch(/pending.*\.git\/config|\.git\/config.*pending|Unresolved/i);
      expect(markdown).not.toMatch(/investigation (is |was )?complete/i);
    } finally {
      store.close();
    }
  });

  it("renders revision and read yields from an explicit handoff", () => {
    const markdown = renderGrokHandoff({
      workId: "work:pi:harnie-tb-da82c4f8",
      revision: "47da672",
      relevantFiles: ["README.md", "analysis.js", "config.json"],
      readYields: ["README.md — # Mystery Project"],
      filesTouched: ["README.md", "analysis.js", "config.json", ".git/config"],
      decisions: [],
      findings: [],
      nextSteps: [],
      operations: ["read README.md — succeeded"],
      eventCounts: emptyCounts(),
      diagnosticCodes: [],
      provenance: { from: "work" },
    });

    expect(markdown).toContain("47da672");
    expect(markdown).toContain("Mystery Project");
    expect(markdown).toMatch(/## Repository/);
    expect(markdown).not.toMatch(/## Files touched/);
    expect(markdown).not.toMatch(/total 16/);
    expect(markdown.length).toBeLessThan(8000);
  });

  it("renders evidence without duplicating Unresolved already in current state", () => {
    const markdown = renderGrokHandoff({
      workId: "work:pi:harnie-tb-da82c4f8",
      currentState: "Unresolved: pending read .git/config",
      unresolved: "pending read .git/config",
      evidence: ["evt-1"],
      decisions: [],
      findings: [],
      nextSteps: [],
      operations: [],
      filesTouched: [],
      eventCounts: emptyCounts(),
      diagnosticCodes: [],
      provenance: { from: "work" },
    });

    expect(markdown).toMatch(/## Evidence/);
    expect(markdown).toContain("evt-1");
    expect(markdown).not.toContain("## Unresolved");
    expect(markdown.length).toBeLessThan(8000);
  });

  it("renders Unresolved when current state does not already contain it", () => {
    const markdown = renderGrokHandoff({
      workId: "work:pi:fixture-c",
      currentState: "Edits reported success on models.ts",
      unresolved: "Verification not recorded",
      decisions: [],
      findings: [],
      nextSteps: [],
      operations: [],
      filesTouched: [],
      eventCounts: emptyCounts(),
      diagnosticCodes: [],
      provenance: { from: "work" },
    });

    expect(markdown).toContain("## Unresolved");
    expect(markdown).toContain("Verification not recorded");
    expect(markdown.length).toBeLessThan(8000);
  });
});
