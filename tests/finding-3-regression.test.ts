import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importPiSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";
import { loadWork } from "../src/store/persist.js";
import { deriveObservedWork } from "../src/work/derive.js";
import { buildHandoffFromWork } from "../src/work/handoff.js";

// Finding 3 (audit lines 74-80): an attached session stayed pending after its
// result arrived. Audit repro (synthetic Pi session): import a pending
// `read config.ts` call, append its successful result, refresh with
// --work <same-work>. The operation kept both call and result evidence but
// still reported pending with next step "Complete pending tool call".
// Root causes: attach retained old event diagnostics and unioned Work
// diagnostics while operation status let the retained missing_tool_result
// diagnostic take precedence over the new result.
describe("finding 3: refreshed session resolves pending call once the result arrives", () => {
  const homes: string[] = [];

  const makeStore = async () => {
    const home = await mkdtemp(join(tmpdir(), "harnie-finding-3-"));
    homes.push(home);
    return initHarnieStore({ home });
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  const pendingSession = [
    '{"type":"session","version":3,"id":"finding-3","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
    '{"type":"message","id":"u1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"user","content":[{"type":"text","text":"Check the config."}]}}',
    '{"type":"message","id":"a1","parentId":"u1","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"f3-call-1","name":"read","arguments":{"path":"config.ts"}}]}}',
  ].join("\n");

  const resolvedSession = [
    pendingSession,
    '{"type":"message","id":"r1","parentId":"a1","timestamp":"2026-01-01T00:00:03.000Z","message":{"role":"toolResult","toolCallId":"f3-call-1","toolName":"read","content":[{"type":"text","text":"config contents"}],"isError":false}}',
  ].join("\n");

  it.each([false, true])("resolves via refresh (explicit attach: %s)", async (attach) => {
    const store = await makeStore();
    const dir = await mkdtemp(join(tmpdir(), "harnie-finding-3sess-"));
    homes.push(dir);
    try {
      const path = join(dir, "session.jsonl");
      await writeFile(path, `${pendingSession}\n`);

      const first = await importPiSessionFile(store, path);
      const pending = loadWork(store, first.workId);
      expect(pending?.operations?.find((op) => op.path === "config.ts")?.status).toBe("pending");
      expect(pending?.nextSteps?.map((step) => step.description))
        .toContain("Complete pending tool call read config.ts");

      await writeFile(path, `${resolvedSession}\n`);
      const refresh = await importPiSessionFile(store, path, attach ? { workId: first.workId } : undefined);
      expect(refresh.workId).toBe(first.workId);
      expect(refresh.eventsInserted).toBe(1);

      const loaded = loadWork(store, first.workId);
      // Completion is reconciled over the updated execution before next steps.
      expect(loaded?.operations?.find((op) => op.path === "config.ts")?.status).toBe("succeeded");
      expect(loaded?.nextSteps ?? []).toEqual([]);
      expect(loaded?.diagnostics.map((item) => item.code)).not.toContain("missing_tool_result");
      expect(loaded?.events.flatMap((event) => event.diagnostics).map((item) => item.code))
        .not.toContain("missing_tool_result");

      // Subsequent derivation agrees: no stale pending work, no redundant read.
      const rederived = deriveObservedWork(loaded!);
      expect(rederived.nextSteps).toBeUndefined();
      expect(rederived.operations?.find((op) => op.path === "config.ts")?.status).toBe("succeeded");
      const handoff = buildHandoffFromWork(loaded!);
      expect(handoff.nextSteps.join(" ")).not.toContain("Complete pending tool call");
      expect(handoff.operations).toContain("read config.ts — succeeded");
    } finally {
      store.close();
    }
  });
});
