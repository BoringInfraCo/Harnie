import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importPiSessionFile } from "../src/engine/import.js";
import { observePiSession } from "../src/pi/observe.js";
import { readPiJsonlFile } from "../src/pi/reader.js";
import { initHarnieStore } from "../src/store/database.js";
import { persistObservedWork } from "../src/store/persist.js";
import { listWorks } from "../src/store/query.js";

describe("listWorks", () => {
  const homes: string[] = [];

  const makeStore = async () => {
    const home = await mkdtemp(join(tmpdir(), "harnie-store-list-"));
    homes.push(home);
    return initHarnieStore({ home });
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("returns an empty list for an empty store", async () => {
    const store = await makeStore();
    try {
      expect(listWorks(store)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("summarizes persisted trace B", async () => {
    const store = await makeStore();
    try {
      const observed = observePiSession(await readPiJsonlFile("tests/fixtures/pi/trace-b-unfinished.jsonl"));
      persistObservedWork(store, observed);
      const summaries = listWorks(store);

      expect(summaries).toHaveLength(1);
      expect(summaries[0]?.id).toBe("work:pi:harnie-tb-da82c4f8");
      expect(summaries[0]?.workspacePath).toBe("/workspace/pi-project");
      expect(summaries[0]?.harness).toBe("pi");
      expect(summaries[0]?.eventCount).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  it("lists two imported works", async () => {
    const store = await makeStore();
    try {
      await importPiSessionFile(store, "tests/fixtures/pi/trace-a-coding.jsonl");
      await importPiSessionFile(store, "tests/fixtures/pi/trace-b-unfinished.jsonl");
      const summaries = listWorks(store);

      expect(summaries).toHaveLength(2);
      expect(summaries.map((summary) => summary.id)).toEqual(
        expect.arrayContaining(["work:pi:harnie-ta-075fe632", "work:pi:harnie-tb-da82c4f8"]),
      );
    } finally {
      store.close();
    }
  });
});
