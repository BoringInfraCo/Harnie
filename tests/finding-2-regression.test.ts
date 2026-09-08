import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importCodexSessionFile, importPiSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";
import { loadWork } from "../src/store/persist.js";
import { buildHandoffFromWork } from "../src/work/handoff.js";

// Finding 2 (audit lines 64-70): re-importing the original Pi session must not
// drop previously attached execution context. Audit repro: import Pi Trace B,
// attach the Codex fixture via --work, then import the original Pi file again
// without --work. Before the engine-level merge the store kept 26 events and
// 2 executions but operations fell 9 -> 6 and the Codex src/cli.ts operation
// disappeared from derived state.
describe("finding 2: ordinary refresh preserves attached execution context", () => {
  const homes: string[] = [];

  const makeStore = async () => {
    const home = await mkdtemp(join(tmpdir(), "harnie-finding-2-"));
    homes.push(home);
    return initHarnieStore({ home });
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("keeps 26 events, 2 executions and all 9 operations on ordinary re-import", async () => {
    const store = await makeStore();
    try {
      const first = await importPiSessionFile(store, "tests/fixtures/pi/trace-b-unfinished.jsonl");
      await importCodexSessionFile(store, "tests/fixtures/codex/unfinished-read.jsonl", { workId: first.workId });

      const before = loadWork(store, first.workId);
      const codexBefore = before?.operations?.filter((op) => op.provenance.harness === "codex");
      expect(before?.events).toHaveLength(26);
      expect(before?.executions).toHaveLength(2);
      expect(before?.operations).toHaveLength(9);
      expect(codexBefore?.length).toBeGreaterThan(0);
      const cliBefore = before?.operations?.find((op) => op.path === "src/cli.ts");
      expect(cliBefore).toBeDefined();

      // Ordinary re-import of the original Pi file (no --work).
      const refresh = await importPiSessionFile(store, "tests/fixtures/pi/trace-b-unfinished.jsonl");
      expect(refresh.workId).toBe(first.workId);
      expect(refresh.eventsInserted).toBe(0);

      const after = loadWork(store, first.workId);
      // Append-only evidence retained; complete projection unchanged.
      expect(after?.events).toHaveLength(26);
      expect(after?.executions).toHaveLength(2);
      expect(after?.operations).toHaveLength(9);
      expect(after?.operations?.find((op) => op.path === "src/cli.ts")).toEqual(cliBefore);
      expect(after).toEqual(before);

      // History and the continuation package agree: the handoff still carries it.
      const handoff = buildHandoffFromWork(after!);
      expect(handoff.operations.some((line) => line.includes("src/cli.ts"))).toBe(true);
    } finally {
      store.close();
    }
  });

  it("keeps attached claims on explicit attach refresh of the original session", async () => {
    const store = await makeStore();
    try {
      const first = await importPiSessionFile(store, "tests/fixtures/pi/trace-b-unfinished.jsonl");
      await importCodexSessionFile(store, "tests/fixtures/codex/unfinished-read.jsonl", { workId: first.workId });
      const before = loadWork(store, first.workId);
      expect(before?.operations).toHaveLength(9);

      // Explicit attach of the same original session must merge, not replace.
      await importPiSessionFile(store, "tests/fixtures/pi/trace-b-unfinished.jsonl", { workId: first.workId });
      const after = loadWork(store, first.workId);
      expect(after?.events).toHaveLength(26);
      expect(after?.executions).toHaveLength(2);
      expect(after?.operations).toHaveLength(9);
      expect(after?.operations?.some((op) => op.path === "src/cli.ts")).toBe(true);
      expect(after).toEqual(before);
    } finally {
      store.close();
    }
  });
});
