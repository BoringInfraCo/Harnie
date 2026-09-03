import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importPiSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";
import { loadWork } from "../src/store/persist.js";

describe("Pi observed import", () => {
  const homes: string[] = [];

  const makeStore = async () => {
    const home = await mkdtemp(join(tmpdir(), "harnie-import-"));
    homes.push(home);
    return initHarnieStore({ home });
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("imports trace B twice without duplicating events", async () => {
    const store = await makeStore();
    try {
      const first = await importPiSessionFile(store, "tests/fixtures/pi/trace-b-unfinished.jsonl");
      const second = await importPiSessionFile(store, "tests/fixtures/pi/trace-b-unfinished.jsonl");
      const loaded = loadWork(store, first.workId);

      expect(first.created).toBe(true);
      expect(first.eventsInserted).toBeGreaterThan(0);
      expect(second.workId).toBe(first.workId);
      expect(second.eventsInserted).toBe(0);
      expect(loaded?.events).toHaveLength(first.eventsInserted);
      expect(loaded?.diagnostics.map((diag) => diag.code)).toContain("missing_tool_result");
    } finally {
      store.close();
    }
  });

  it("appends only new events when a session file grows", async () => {
    const store = await makeStore();
    const dir = await mkdtemp(join(tmpdir(), "harnie-session-"));
    homes.push(dir);
    try {
      const prefix = [
        '{"type":"session","version":3,"id":"grow-1","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
        '{"type":"message","id":"u1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"user","content":"start"}}',
      ].join("\n");
      const grown = [
        prefix,
        '{"type":"message","id":"a1","parentId":"u1","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"assistant","content":[{"type":"text","text":"ok"}]}}',
      ].join("\n");
      const firstPath = join(dir, "prefix.jsonl");
      const grownPath = join(dir, "grown.jsonl");
      await writeFile(firstPath, `${prefix}\n`);
      await writeFile(grownPath, `${grown}\n`);

      const first = await importPiSessionFile(store, firstPath);
      const second = await importPiSessionFile(store, grownPath);
      const loaded = loadWork(store, first.workId);

      expect(first.workId).toBe("work:pi:grow-1");
      expect(second.workId).toBe(first.workId);
      expect(second.created).toBe(false);
      expect(second.eventsInserted).toBeGreaterThan(0);
      expect(loaded?.events).toHaveLength(first.eventsInserted + second.eventsInserted);
    } finally {
      store.close();
    }
  });
});
