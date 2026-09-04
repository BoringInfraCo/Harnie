import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importCodexSessionFile, importPiSessionFile } from "../src/engine/import.js";
import { renderCodexHandoff } from "../src/handoff/codex.js";
import { initHarnieStore } from "../src/store/database.js";
import { loadWork } from "../src/store/persist.js";
import { buildHandoffFromWork } from "../src/work/handoff.js";
import type { Work } from "../src/work/types.js";

const CODEX_FIXTURE = "tests/fixtures/codex/unfinished-read.jsonl";
const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";

describe("renderCodexHandoff", () => {
  const homes: string[] = [];

  const makeStore = async () => {
    const home = await mkdtemp(join(tmpdir(), "harnie-handoff-codex-"));
    homes.push(home);
    return initHarnieStore({ home });
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("renders Codex-imported work as a Codex continuation, not rollout JSONL", async () => {
    const store = await makeStore();
    try {
      const result = await importCodexSessionFile(store, CODEX_FIXTURE);
      const loaded = loadWork(store, result.workId);
      expect(loaded).toBeDefined();
      const handoff = buildHandoffFromWork(loaded as Work);
      const markdown = renderCodexHandoff(handoff);

      expect(markdown).toMatch(/for Codex/);
      expect(markdown).toMatch(/Continue/);
      expect(markdown).not.toMatch(/"type":"response_item"/);
      expect(markdown).not.toMatch(/secretly rewrite/i);
      // Pending quiet.ts read keeps work unresolved.
      expect(markdown).toMatch(/quiet\.ts|Unresolved|pending/i);
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
      const markdown = renderCodexHandoff(handoff);

      expect(markdown).toMatch(/pending.*\.git\/config|\.git\/config.*pending|Unresolved/i);
      expect(markdown).not.toMatch(/investigation (is |was )?complete/i);
    } finally {
      store.close();
    }
  });
});
