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

const FIXTURE_C = "tests/fixtures/pi/stateful-prefix.jsonl";
const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";

describe("operation persistence", () => {
  const homes: string[] = [];

  const makeStore = async () => {
    const home = await mkdtemp(join(tmpdir(), "harnie-operations-persist-"));
    homes.push(home);
    return initHarnieStore({ home });
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("imports fixture C with successful edits of models.ts and types.ts", async () => {
    const store = await makeStore();
    try {
      const result = await importPiSessionFile(store, FIXTURE_C);
      const loaded = loadWork(store, result.workId);
      const operations = loaded?.operations ?? [];

      expect(operations.some((operation) => operation.path?.includes("models.ts"))).toBe(true);
      expect(operations.some((operation) => operation.path?.includes("types.ts"))).toBe(true);
      expect(operationMatching(operations, "edit", "models.ts")?.status).toBe("succeeded");
      expect(operationMatching(operations, "edit", "types.ts")?.status).toBe("succeeded");
    } finally {
      store.close();
    }
  });

  it("imports trace B with read files and a pending .git/config", async () => {
    const store = await makeStore();
    try {
      const result = await importPiSessionFile(store, TRACE_B);
      const loaded = loadWork(store, result.workId);
      const operations = loaded?.operations ?? [];

      expect(operations.some((operation) => operation.path?.includes("README.md"))).toBe(true);
      expect(operations.some((operation) => operation.path?.includes("analysis.js"))).toBe(true);
      expect(operations.some((operation) => operation.path?.includes("config.json"))).toBe(true);
      expect(operationMatching(operations, undefined, ".git/config")?.status).toBe("pending");
    } finally {
      store.close();
    }
  });

  it("keeps operation ids stable when a second import inserts no events", async () => {
    const store = await makeStore();
    try {
      const first = await importPiSessionFile(store, TRACE_B);
      const loaded = loadWork(store, first.workId);
      const second = await importPiSessionFile(store, TRACE_B);
      const reloaded = loadWork(store, second.workId);

      expect(second.eventsInserted).toBe(0);
      expect(reloaded?.operations?.map((operation) => operation.id)).toEqual(
        loaded?.operations?.map((operation) => operation.id),
      );
    } finally {
      store.close();
    }
  });

  it("persists raw observed work without operations", async () => {
    const store = await makeStore();
    try {
      const observed = observePiSession(await readPiJsonlFile(FIXTURE_C));
      persistObservedWork(store, observed);
      const loaded = loadWork(store, observed.id);

      expect(loaded).not.toHaveProperty("operations");
    } finally {
      store.close();
    }
  });

  it("does not persist operations with empty evidence", async () => {
    const store = await makeStore();
    try {
      const observed = observePiSession(await readPiJsonlFile(FIXTURE_C));
      const provenance = { harness: "pi", line: 1, observation: "derived" as const };
      persistObservedWork(store, {
        ...observed,
        operations: [
          {
            id: "operation:kept",
            toolName: "edit",
            path: "packages/ai/src/models.ts",
            status: "succeeded",
            evidence: [observed.events[0]?.id ?? "event:1"],
            provenance,
            rule: "test.kept",
          },
          {
            id: "operation:empty",
            toolName: "read",
            path: ".git/config",
            status: "pending",
            evidence: [],
            provenance,
            rule: "test.empty",
          },
        ],
      });
      const loaded = loadWork(store, observed.id);

      expect(loaded?.operations?.map((operation) => operation.id)).toEqual(["operation:kept"]);
      expect(loaded?.operations?.[0]?.status).toBe("succeeded");
      expect(loaded?.operations?.[0]?.path).toContain("models.ts");
    } finally {
      store.close();
    }
  });
});

const operationMatching = (
  operations: NonNullable<Work["operations"]>,
  toolName: string | undefined,
  pathPart: string,
) =>
  operations.find((operation) =>
    (toolName === undefined || operation.toolName === toolName) &&
    (operation.path?.includes(pathPart) ?? false),
  );
