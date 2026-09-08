import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCheckpoint, checkpointFaultHooks, listCheckpoints } from "../src/store/checkpoints.js";
import { initHarnieStore, storeDatabase, type HarnieStore } from "../src/store/database.js";
import { loadWork, persistObservedWork } from "../src/store/persist.js";
import { deriveObservedWork } from "../src/work/derive.js";
import type { Work } from "../src/work/types.js";

const WORK_ID = "work:seam:1";
const EXECUTION_ID = "execution:seam:1";
const SOURCE_SESSION = "s-seam";
const PROVENANCE = JSON.stringify({ harness: "pi", line: 1, observation: "observed" });

const homes: string[] = [];

const makeHome = async (): Promise<string> => {
  const home = await mkdtemp(join(tmpdir(), "harnie-fix-checkpoint-"));
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
        sourceSession: { harness: "pi", sourceId: SOURCE_SESSION },
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

// Simulates a concurrent writer committing an event between the watermark
// capture and the semantic derivation, by appending an event row from inside
// the checkpoint transaction (the seam runs under the write lock, so the row
// joins the snapshot transaction on the same connection).
const injectConcurrentEvent = (store: HarnieStore, afterOrdinal: number): void => {
  const db = storeDatabase(store);
  db.prepare(`INSERT INTO events (id, work_id, execution_id, kind, payload, provenance, diagnostics,
    harness, source_session_id, source_event_id, provenance_line, ordinal)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    "event:seam:3",
    WORK_ID,
    EXECUTION_ID,
    "message",
    JSON.stringify({ role: "assistant", content: "I will inject a decision." }),
    PROVENANCE,
    "[]",
    "pi",
    SOURCE_SESSION,
    "event:seam:3",
    3,
    afterOrdinal + 1,
  );
};

describe("checkpoint snapshot atomicity", () => {
  afterEach(async () => {
    checkpointFaultHooks.afterWatermarkCapture = undefined;
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("derives the snapshot only from events the pinned watermark covers", async () => {
    const home = await makeHome();
    const store = initHarnieStore({ home });
    try {
      seedWork(store);
      const before = loadWork(store, WORK_ID);
      expect(before?.events).toHaveLength(2);

      checkpointFaultHooks.afterWatermarkCapture = ({ workId, watermark }) => {
        expect(workId).toBe(WORK_ID);
        expect(watermark).toBe(1);
        injectConcurrentEvent(store, watermark);
      };

      const checkpoint = createCheckpoint(store, WORK_ID, "mid-write");
      // The injected event (ordinal 2) must be excluded from both the pinned
      // watermark and the derived semantic state.
      expect(checkpoint.eventOrdinalWatermark).toBe(1);
      expect(checkpoint.eventCount).toBe(2);
      expect(checkpoint.decisions).toHaveLength(1);
      expect(checkpoint.decisions[0]?.summary).toBe("I will fix the bug now.");
      expect(JSON.stringify(checkpoint.decisions)).not.toContain("inject");
      expect(checkpoint.goal?.statement).toBe("fix the bug");
    } finally {
      store.close();
    }

    // The injected event belongs to the (simulated) concurrent writer and is
    // committed with the transaction; the checkpoint stays consistent with the
    // pre-watermark events only.
    const reopened = initHarnieStore({ home });
    try {
      expect(loadWork(reopened, WORK_ID)?.events).toHaveLength(3);
      const [checkpoint] = listCheckpoints(reopened, WORK_ID);
      expect(checkpoint?.eventOrdinalWatermark).toBe(1);
      expect(checkpoint?.eventCount).toBe(2);
      expect(checkpoint?.decisions).toHaveLength(1);
      expect(JSON.stringify(checkpoint?.decisions)).not.toContain("inject");
      expect(checkpoint?.nextSteps).toEqual([]);
    } finally {
      reopened.close();
    }
  });

  it("keeps single-writer behavior: the snapshot matches the live derived state", async () => {
    const home = await makeHome();
    const store = initHarnieStore({ home });
    try {
      seedWork(store);
      const live = loadWork(store, WORK_ID);
      expect(live).toBeDefined();

      const checkpoint = createCheckpoint(store, WORK_ID, "plain");
      expect(checkpoint.eventOrdinalWatermark).toBe(1);
      expect(checkpoint.eventCount).toBe(2);
      expect(checkpoint.decisions).toEqual(live?.decisions ?? []);
      expect(checkpoint.findings).toEqual(live?.findings ?? []);
      expect(checkpoint.nextSteps).toEqual(live?.nextSteps ?? []);
      expect(checkpoint.operations).toEqual(live?.operations ?? []);
      expect(checkpoint.goal).toEqual(live?.goal);
      expect(checkpoint.executionId).toBe(EXECUTION_ID);
    } finally {
      store.close();
    }
  });
});
