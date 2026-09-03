import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importPiSessionFile } from "../src/engine/import.js";
import { observePiSession } from "../src/pi/observe.js";
import { readPiJsonlFile } from "../src/pi/reader.js";
import { initHarnieStore } from "../src/store/database.js";
import { loadWork, persistObservedWork } from "../src/store/persist.js";
import type { Work } from "../src/work/types.js";

describe("derived claim persistence", () => {
  const homes: string[] = [];

  const makeStore = async () => {
    const home = await mkdtemp(join(tmpdir(), "harnie-derive-persist-"));
    homes.push(home);
    return initHarnieStore({ home });
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("imports fixture C with a derived goal and evidenced decision", async () => {
    const store = await makeStore();
    try {
      const result = await importPiSessionFile(store, "tests/fixtures/pi/stateful-prefix.jsonl");
      const loaded = loadWork(store, result.workId);

      expect(loaded?.goal).toBeDefined();
      expect(loaded?.decisions?.length).toBeGreaterThan(0);
      expectDerivedClaimsHaveEvidence(loaded);
    } finally {
      store.close();
    }
  });

  it("imports trace B with next steps, no completion finding, and idempotent re-import", async () => {
    const store = await makeStore();
    try {
      const first = await importPiSessionFile(store, "tests/fixtures/pi/trace-b-unfinished.jsonl");
      const loaded = loadWork(store, first.workId);

      expect(loaded?.nextSteps?.length).toBeGreaterThan(0);
      for (const finding of loaded?.findings ?? []) {
        expect(finding.statement).not.toMatch(/\b(complete[ds]?|completion|finished|done)\b/i);
      }

      const second = await importPiSessionFile(store, "tests/fixtures/pi/trace-b-unfinished.jsonl");
      const reloaded = loadWork(store, second.workId);

      expect(second.eventsInserted).toBe(0);
      expect(reloaded?.goal).toEqual(loaded?.goal);
      expect(reloaded?.decisions?.map((decision) => decision.id)).toEqual(
        loaded?.decisions?.map((decision) => decision.id),
      );
    } finally {
      store.close();
    }
  });

  it("persists raw observed work without derived claims", async () => {
    const store = await makeStore();
    try {
      const observed = observePiSession(await readPiJsonlFile("tests/fixtures/pi/stateful-prefix.jsonl"));
      persistObservedWork(store, observed);
      const loaded = loadWork(store, observed.id);

      expect(loaded).not.toHaveProperty("goal");
      expect(loaded).not.toHaveProperty("decisions");
      expect(loaded).not.toHaveProperty("findings");
      expect(loaded).not.toHaveProperty("nextSteps");
    } finally {
      store.close();
    }
  });

  it("does not persist derived claims with empty evidence", async () => {
    const store = await makeStore();
    try {
      const observed = observePiSession(await readPiJsonlFile("tests/fixtures/pi/stateful-prefix.jsonl"));
      const provenance = { harness: "pi", line: 1, observation: "derived" as const };
      persistObservedWork(store, {
        ...observed,
        goal: {
          statement: "ungrounded goal",
          evidence: [],
          provenance,
          rule: "test.empty",
        },
        decisions: [
          {
            id: "decision:kept",
            summary: "keep this",
            evidence: [observed.events[0]?.id ?? "event:1"],
            provenance,
            rule: "test.kept",
          },
          {
            id: "decision:empty",
            summary: "drop this",
            evidence: [],
            provenance,
            rule: "test.empty",
          },
        ],
      });
      const loaded = loadWork(store, observed.id);

      expect(loaded).not.toHaveProperty("goal");
      expect(loaded?.decisions?.map((decision) => decision.id)).toEqual(["decision:kept"]);
    } finally {
      store.close();
    }
  });
});

const expectDerivedClaimsHaveEvidence = (work: Work | undefined): void => {
  expect(work).toBeDefined();
  const claims = [
    ...(work?.goal ? [work.goal] : []),
    ...(work?.decisions ?? []),
    ...(work?.findings ?? []),
    ...(work?.nextSteps ?? []),
  ];

  expect(claims.length).toBeGreaterThan(0);
  for (const claim of claims) {
    expect(claim.evidence.length).toBeGreaterThanOrEqual(1);
    expect(claim.provenance.observation).toBe("derived");
  }
};
