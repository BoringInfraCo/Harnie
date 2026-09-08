import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCheckpoint } from "../src/store/checkpoints.js";
import { initHarnieStore, storeDatabase, type HarnieStore } from "../src/store/database.js";
import { createFork, forkFaultHooks } from "../src/store/fork.js";
import { listWorks } from "../src/store/query.js";
import { loadWork, persistObservedWork } from "../src/store/persist.js";
import { deriveObservedWork } from "../src/work/derive.js";
import type { Work } from "../src/work/types.js";

const WORK_ID = "work:seam:1";
const EXECUTION_ID = "execution:seam:1";

const homes: string[] = [];

const makeHome = async (): Promise<string> => {
  const home = await mkdtemp(join(tmpdir(), "harnie-fix-fork-"));
  homes.push(home);
  return home;
};

const seedWork = (store: HarnieStore): void => {
  const work: Work = {
    id: WORK_ID,
    workspace: { path: "/workspace/seam" },
    executions: [
      {
        id: EXECUTION_ID,
        workId: WORK_ID,
        harness: "pi",
        sourceSession: { harness: "pi", sourceId: "s-seam" },
      },
    ],
    events: [
      {
        id: "event:seam:1",
        workId: WORK_ID,
        executionId: EXECUTION_ID,
        kind: "message",
        payload: { role: "user", content: "fix the bug" },
        provenance: { harness: "pi", line: 1, observation: "observed" },
        diagnostics: [],
      },
      {
        id: "event:seam:2",
        workId: WORK_ID,
        executionId: EXECUTION_ID,
        kind: "message",
        payload: { role: "assistant", content: "I will fix the bug now." },
        provenance: { harness: "pi", line: 2, observation: "observed" },
        diagnostics: [],
      },
    ],
    diagnostics: [],
  };
  persistObservedWork(store, deriveObservedWork(work));
};

describe("fork creation atomicity", () => {
  afterEach(async () => {
    forkFaultHooks.beforeDerivedClaimsPersist = undefined;
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("leaves no partial fork when the derived-state persistence step fails", async () => {
    const home = await makeHome();
    const store = initHarnieStore({ home });
    try {
      seedWork(store);
      const worksBefore = listWorks(store).map((work) => work.id);

      forkFaultHooks.beforeDerivedClaimsPersist = () => {
        throw new Error("injected derived-state failure");
      };
      expect(() => createFork(store, WORK_ID, "boom")).toThrow("injected derived-state failure");

      const db = storeDatabase(store);
      // No fork is visible: no works row, no copied executions/events/claims.
      expect(listWorks(store).map((work) => work.id)).toEqual(worksBefore);
      expect(
        db.prepare("SELECT COUNT(*) AS count FROM works WHERE forked_from_work_id IS NOT NULL").get(),
      ).toEqual({ count: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM events WHERE work_id LIKE 'work:fork:%'").get()).toEqual({
        count: 0,
      });
      expect(db.prepare("SELECT COUNT(*) AS count FROM executions WHERE work_id LIKE 'work:fork:%'").get()).toEqual({
        count: 0,
      });
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("creates a complete fork (events and derived state) after a failed attempt", async () => {
    const home = await makeHome();
    const store = initHarnieStore({ home });
    let childId = "";
    try {
      seedWork(store);
      createCheckpoint(store, WORK_ID, "before fork");
      const parent = loadWork(store, WORK_ID);
      expect(parent?.decisions).toHaveLength(1);

      forkFaultHooks.beforeDerivedClaimsPersist = () => {
        throw new Error("injected derived-state failure");
      };
      expect(() => createFork(store, WORK_ID, "boom")).toThrow();

      forkFaultHooks.beforeDerivedClaimsPersist = undefined;
      childId = createFork(store, WORK_ID, "explore").workId;

      const child = loadWork(store, childId);
      expect(child?.events).toHaveLength(parent?.events.length ?? -1);
      expect(child?.forkedFrom?.workId).toBe(WORK_ID);
      expect(child?.forkedFrom?.checkpointId).toBe(`checkpoint:${WORK_ID}:0001`);
      expect(child?.forkedFrom?.message).toBe("explore");
      // Derived state was persisted with the fork, not left behind.
      expect(child?.goal?.statement).toBe("fix the bug");
      expect(child?.decisions).toHaveLength(parent?.decisions?.length ?? -1);

      const db = storeDatabase(store);
      expect(
        db.prepare("SELECT COUNT(*) AS count FROM decisions WHERE work_id = ?").get(childId),
      ).toEqual({ count: 1 });
      expect(
        db.prepare("SELECT goal_json FROM works WHERE id = ?").get(childId),
      ).toEqual({ goal_json: expect.any(String) });
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      store.close();
    }
  });
});
