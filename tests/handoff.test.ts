import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importPiSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";
import { loadWork } from "../src/store/persist.js";
import { buildHandoffFromWork } from "../src/work/handoff.js";
import type { Work } from "../src/work/types.js";

const FIXTURE_C = "tests/fixtures/pi/stateful-prefix.jsonl";
const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";

describe("buildHandoffFromWork", () => {
  const homes: string[] = [];

  const makeStore = async () => {
    const home = await mkdtemp(join(tmpdir(), "harnie-handoff-"));
    homes.push(home);
    return initHarnieStore({ home });
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("builds a compact Work-backed handoff from fixture C", async () => {
    const store = await makeStore();
    try {
      const result = await importPiSessionFile(store, FIXTURE_C);
      const loaded = loadWork(store, result.workId);
      expect(loaded).toBeDefined();
      const handoff = buildHandoffFromWork(loaded as Work);
      const fixtureBytes = (await readFile(FIXTURE_C)).byteLength;

      expect(handoff.goal).toMatch(/xhigh|5\.3/i);
      expect(handoff.decisions.some((decision) => /I will/i.test(decision))).toBe(true);
      expect(handoff.provenance.from).toBe("work");
      expect(JSON.stringify(handoff).length).toBeLessThan(fixtureBytes * 0.5);
    } finally {
      store.close();
    }
  });

  it("keeps trace B unresolved without claiming completion", async () => {
    const store = await makeStore();
    try {
      const result = await importPiSessionFile(store, TRACE_B);
      const loaded = loadWork(store, result.workId);
      expect(loaded).toBeDefined();
      const handoff = buildHandoffFromWork(loaded as Work);
      const serialized = JSON.stringify(handoff);

      expect(handoff.nextSteps.length).toBeGreaterThanOrEqual(1);
      expect(handoff.currentState).toMatch(/unresolved|pending/i);
      expect(serialized).not.toMatch(/investigation (is |was )?complete/i);
      expect(serialized).not.toMatch(/refactoring plan ready/i);
    } finally {
      store.close();
    }
  });

  it("builds a handoff from synthetic Work without Pi types", () => {
    const work: Work = {
      id: "work:synthetic:1",
      executions: [
        {
          id: "execution:synthetic:1",
          workId: "work:synthetic:1",
          harness: "synthetic",
          sourceSession: {
            harness: "synthetic",
            sourceId: "sess-1",
          },
        },
      ],
      events: [],
      diagnostics: [],
    };

    const handoff = buildHandoffFromWork(work);

    expect(handoff.workId).toBe("work:synthetic:1");
    expect(handoff.decisions).toEqual([]);
    expect(handoff.provenance.from).toBe("work");
  });
});
