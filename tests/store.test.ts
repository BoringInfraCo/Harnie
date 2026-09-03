import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { observePiSession } from "../src/pi/observe.js";
import { readPiJsonlFile } from "../src/pi/reader.js";
import { databasePath, initHarnieStore, openHarnieStore } from "../src/store/database.js";
import { loadWork, persistObservedWork } from "../src/store/persist.js";

describe("Harnie work store", () => {
  const homes: string[] = [];

  const makeStore = async () => {
    const home = await mkdtemp(join(tmpdir(), "harnie-store-"));
    homes.push(home);
    return { home, store: initHarnieStore({ home }) };
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("creates a schema idempotently", async () => {
    const { home, store } = await makeStore();
    store.close();
    const again = initHarnieStore({ home });
    again.close();

    const db = new DatabaseSync(databasePath(home));
    const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as unknown as Array<{ name: string }>)
      .map((row) => row.name);
    db.close();

    expect(tables.sort()).toEqual(["events", "executions", "source_sessions", "works"].sort());
    expect(tables.some((name) => /decision|finding|goal/i.test(name))).toBe(false);
  });

  it("persists and reloads trace B including missing tool result", async () => {
    const { store } = await makeStore();
    try {
      const observed = observePiSession(await readPiJsonlFile("tests/fixtures/pi/trace-b-unfinished.jsonl"));
      const result = persistObservedWork(store, observed);
      const loaded = loadWork(store, result.workId);

      expect(result.created).toBe(true);
      expect(loaded?.id).toBe("work:pi:harnie-tb-da82c4f8");
      expect(loaded?.workspace).toEqual({ path: "/workspace/pi-project" });
      expect(loaded?.executions).toHaveLength(1);
      expect(loaded?.executions[0]?.sourceSession.sourceFormat).toBe("pi-session-v3");
      expect(loaded?.diagnostics.map((diag) => diag.code)).toContain("missing_tool_result");
      expect(loaded?.events.some((event) => event.kind === "tool_call" && event.payload.toolCallId === "harnie-call-0006")).toBe(true);
      expect(loaded?.events.every((event) => event.provenance.line > 0)).toBe(true);
    } finally {
      store.close();
    }
  });

  it("reloads trace A tool calls without specializing write/read/bash", async () => {
    const { store } = await makeStore();
    try {
      const observed = observePiSession(await readPiJsonlFile("tests/fixtures/pi/trace-a-coding.jsonl"));
      persistObservedWork(store, observed);
      const loaded = loadWork(store, observed.id);
      const toolCalls = loaded?.events.filter((event) => event.kind === "tool_call") ?? [];

      expect(toolCalls.map((event) => event.payload.toolName)).toEqual([
        "write",
        "read",
        "bash",
        "bash",
        "bash",
        "write",
        "bash",
      ]);
      expect(loaded?.events.find((event) => event.kind === "tool_result" && event.payload.isError === true)?.payload.toolName).toBe("write");
      expect(loaded?.events.map((event) => event.kind)).not.toContain("file_read");
      expect(loaded?.events.map((event) => event.kind)).not.toContain("file_write");
    } finally {
      store.close();
    }
  });

  it("does not duplicate events on a second persist of the same work", async () => {
    const { store } = await makeStore();
    try {
      const observed = observePiSession(await readPiJsonlFile("tests/fixtures/pi/trace-b-unfinished.jsonl"));
      const first = persistObservedWork(store, observed);
      const second = persistObservedWork(store, observed);
      const loaded = loadWork(store, first.workId);

      expect(second.workId).toBe(first.workId);
      expect(second.created).toBe(false);
      expect(second.eventsInserted).toBe(0);
      expect(loaded?.events).toHaveLength(observed.events.length);
    } finally {
      store.close();
    }
  });

  it("reloads work after closing and reopening the database", async () => {
    const { home, store } = await makeStore();
    const observed = observePiSession(await readPiJsonlFile("tests/fixtures/pi/trace-b-unfinished.jsonl"));
    persistObservedWork(store, observed);
    store.close();

    const reopened = openHarnieStore({ home });
    try {
      const loaded = loadWork(reopened, observed.id);
      expect(loaded?.workspace).toEqual({ path: "/workspace/pi-project" });
      expect(loaded?.events).toHaveLength(observed.events.length);
      expect(loaded?.diagnostics.map((diag) => diag.code)).toContain("missing_tool_result");
    } finally {
      reopened.close();
    }
  });

  it("does not persist derived goal or decision objects", async () => {
    const { store } = await makeStore();
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
});
