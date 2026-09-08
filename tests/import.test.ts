import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importCodexSessionFile, importPiSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";
import { createCheckpoint } from "../src/store/checkpoints.js";
import { loadWorkAtCheckpoint } from "../src/store/fork.js";
import { buildHandoffFromWork } from "../src/work/handoff.js";
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

  it("preserves attached claims on an ordinary refresh", async () => {
    const store = await makeStore();
    try {
      const first = await importPiSessionFile(store, "tests/fixtures/pi/trace-b-unfinished.jsonl");
      await importCodexSessionFile(store, "tests/fixtures/codex/unfinished-read.jsonl", { workId: first.workId });
      const before = loadWork(store, first.workId);
      expect(before?.operations?.some((operation) => operation.provenance.harness === "codex")).toBe(true);
      const refresh = await importPiSessionFile(store, "tests/fixtures/pi/trace-b-unfinished.jsonl");
      const after = loadWork(store, first.workId);
      expect(refresh.eventsInserted).toBe(0);
      expect(after).toEqual(before);
    } finally {
      store.close();
    }
  });

  it.each([false, true])("clears resolved pending diagnostics on refresh (explicit attach: %s)", async (attach) => {
    const store = await makeStore();
    const dir = await mkdtemp(join(tmpdir(), "harnie-pending-"));
    homes.push(dir);
    try {
      const path = join(dir, "session.jsonl");
      const prefix = await readFile("tests/fixtures/pi/trace-b-unfinished.jsonl", "utf8");
      await writeFile(path, prefix);
      const first = await importPiSessionFile(store, path);
      expect(loadWork(store, first.workId)?.nextSteps?.length).toBeGreaterThan(0);
      const checkpoint = createCheckpoint(store, first.workId, "pending read");
      const frozen = buildHandoffFromWork(loadWorkAtCheckpoint(store, first.workId, checkpoint.id));
      await writeFile(path, prefix.trimEnd() + "\n" + JSON.stringify({
        type: "message", id: "resolved", parentId: "harnie-tb-92ee92f6",
        message: { role: "toolResult", toolCallId: "harnie-call-0006", toolName: "read", content: [{ type: "text", text: "config" }], isError: false },
      }) + "\n");
      const result = await importPiSessionFile(store, path, attach ? { workId: first.workId } : undefined);
      const loaded = loadWork(store, first.workId);
      expect(result.eventsInserted).toBe(1);
      expect(buildHandoffFromWork(loadWorkAtCheckpoint(store, first.workId, checkpoint.id))).toEqual(frozen);
      expect(loaded?.nextSteps ?? []).toEqual([]);
      expect(loaded?.diagnostics.some((item) => item.code === "missing_tool_result")).toBe(false);
      expect(loaded?.events.flatMap((event) => event.diagnostics).some((item) => item.code === "missing_tool_result")).toBe(false);
      expect(loaded?.operations?.find((operation) => operation.path === ".git/config")?.status).toBe("succeeded");
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
