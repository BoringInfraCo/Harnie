import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importPiSessionFile } from "../src/engine/import.js";
import { observePiSession } from "../src/pi/observe.js";
import { readPiJsonlFile, readPiJsonlText } from "../src/pi/reader.js";
import { initHarnieStore } from "../src/store/database.js";
import { loadWork } from "../src/store/persist.js";
import { extractObservedContext } from "../src/work/context.js";
import { deriveObservedWork } from "../src/work/derive.js";
import type { Work } from "../src/work/types.js";

const FIXTURE_C = "tests/fixtures/pi/stateful-prefix.jsonl";
const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";

describe("extractObservedContext", () => {
  const homes: string[] = [];

  const makeStore = async () => {
    const home = await mkdtemp(join(tmpdir(), "harnie-context-"));
    homes.push(home);
    return initHarnieStore({ home });
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("extracts Trace B revision, relevant reads, and first-line yields without ls trees", async () => {
    const store = await makeStore();
    try {
      const result = await importPiSessionFile(store, TRACE_B);
      const loaded = loadWork(store, result.workId);
      expect(loaded).toBeDefined();
      const context = extractObservedContext(loaded as Work);
      const derived = deriveObservedWork(observePiSession(await readPiJsonlFile(TRACE_B)));
      const derivedContext = extractObservedContext(derived);
      const blob = JSON.stringify(context);

      expect(context.revision).toBe("47da672");
      expect(derivedContext.revision).toBe("47da672");
      expect(context.relevantFiles.some((path) => path.endsWith("README.md"))).toBe(true);
      expect(context.relevantFiles.some((path) => path.endsWith("analysis.js"))).toBe(true);
      expect(context.relevantFiles.some((path) => path.endsWith("config.json"))).toBe(true);
      expect(context.relevantFiles.some((path) => path.endsWith(".git/config"))).toBe(false);
      expect(context.readYields.some((yieldLine) => yieldLine.includes("# Mystery Project"))).toBe(true);
      expect(blob).not.toMatch(/total /);
      expect(blob).not.toMatch(/drwx/);
      expect(blob).not.toMatch(/directory listing/i);
    } finally {
      store.close();
    }
  });

  it("names Fixture C changed files without inventing a revision or treating rg as an edit", async () => {
    const store = await makeStore();
    try {
      const result = await importPiSessionFile(store, FIXTURE_C);
      const loaded = loadWork(store, result.workId);
      expect(loaded).toBeDefined();
      const context = extractObservedContext(loaded as Work);
      const changed = context.changedFiles.join("\n");

      expect(changed).toContain("packages/ai/src/models.ts");
      expect(changed).toContain("packages/agent/src/types.ts");
      expect(context.revision).toBeUndefined();
      expect(changed).not.toMatch(/\brg\b/);
      expect(context.changedFiles.some((path) => /rg|grep|bash/i.test(path))).toBe(false);
    } finally {
      store.close();
    }
  });

  it("records a failed write as a failed approach, not a success", () => {
    const work = observePiSession(readPiJsonlText([
      '{"type":"session","version":3,"id":"s-error","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
      '{"type":"message","id":"a1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"c1","name":"write","arguments":{"path":".env"}}]}}',
      '{"type":"message","id":"r1","parentId":"a1","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"toolResult","toolCallId":"c1","toolName":"write","content":[{"type":"text","text":"Permission denied"}],"isError":true}}',
    ].join("\n")));
    const context = extractObservedContext(work);

    expect(context.failedApproaches.some((line) =>
      /write .env — failed \(Permission denied\)/.test(line)
    )).toBe(true);
    expect(context.changedFiles).not.toContain(".env");
    expect(context.failedApproaches.join("\n")).not.toMatch(/succeed/i);
  });

  it("records failed bash npm test as test state", () => {
    const work = observePiSession(readPiJsonlText([
      '{"type":"session","version":3,"id":"s-test","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
      '{"type":"message","id":"a1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"c1","name":"bash","arguments":{"command":"npm test"}}]}}',
      '{"type":"message","id":"r1","parentId":"a1","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"toolResult","toolCallId":"c1","toolName":"bash","content":[{"type":"text","text":"FAIL"}],"isError":true}}',
    ].join("\n")));
    const context = extractObservedContext(work);

    expect(context.testState).toMatch(/npm test/i);
    expect(context.testState).toMatch(/failed/);
  });
});
