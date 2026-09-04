import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importOpenCodeSessionFile, importPiSessionFile } from "../src/engine/import.js";
import { renderPiHandoff } from "../src/handoff/pi.js";
import { initHarnieStore } from "../src/store/database.js";
import { loadWork } from "../src/store/persist.js";
import { buildHandoffFromWork, type Handoff } from "../src/work/handoff.js";
import type { Work } from "../src/work/types.js";

const OPENCODE_FIXTURE = "tests/fixtures/opencode/sprint-012-handoff.json";
const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";
const hasOpenCodeFixture = existsSync(OPENCODE_FIXTURE);

const emptyCounts = (): Handoff["eventCounts"] => ({
  message: 0,
  tool_call: 0,
  tool_result: 0,
  command: 0,
  unknown: 0,
});

describe("renderPiHandoff", () => {
  const homes: string[] = [];

  const makeStore = async () => {
    const home = await mkdtemp(join(tmpdir(), "harnie-handoff-pi-"));
    homes.push(home);
    return initHarnieStore({ home });
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it.skipIf(!hasOpenCodeFixture)(
    "renders OpenCode-imported work as a Pi continuation, not JSONL",
    async () => {
      const store = await makeStore();
      try {
        const result = await importOpenCodeSessionFile(store, OPENCODE_FIXTURE);
        const loaded = loadWork(store, result.workId);
        expect(loaded).toBeDefined();
        const handoff = buildHandoffFromWork(loaded as Work);
        const markdown = renderPiHandoff(handoff);

        expect(markdown).toMatch(/for Pi/);
        expect(markdown).toMatch(/Continue/);
        expect(markdown).not.toMatch(/\{"type":"session"/);

        const hasHandoffTs =
          handoff.filesTouched.some((path) => path.includes("handoff.ts")) ||
          handoff.operations.some((line) => line.includes("handoff.ts"));
        if (hasHandoffTs) {
          expect(markdown).toMatch(/handoff\.ts/);
        }
      } finally {
        store.close();
      }
    },
  );

  it("keeps Trace B unresolved without claiming investigation complete", async () => {
    const store = await makeStore();
    try {
      const result = await importPiSessionFile(store, TRACE_B);
      const loaded = loadWork(store, result.workId);
      expect(loaded).toBeDefined();
      const handoff = buildHandoffFromWork(loaded as Work);
      const markdown = renderPiHandoff(handoff);

      expect(markdown).toMatch(/pending.*\.git\/config|\.git\/config.*pending|Unresolved/i);
      expect(markdown).not.toMatch(/investigation (is |was )?complete/i);
      expect(markdown).not.toMatch(/total 16/);
      expect(markdown).not.toContain("# Mystery Project\n\nA project that needs");
    } finally {
      store.close();
    }
  });

  it("renders revision and read yields from an explicit handoff", () => {
    const markdown = renderPiHandoff({
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
});
