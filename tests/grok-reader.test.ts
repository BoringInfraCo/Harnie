import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readGrokSessionPath, readGrokSessionText } from "../src/grok/reader.js";

const FIXTURE_DIR = "tests/fixtures/grok/unfinished-demo";
const CHAT_FILE = `${FIXTURE_DIR}/chat_history.jsonl`;
const SESSION_ID = "01grokdemo000000000000000001";

describe("readGrokSessionPath", () => {
  const temps: string[] = [];

  afterEach(async () => {
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("reads a session directory with its summary sidecar", async () => {
    const session = await readGrokSessionPath(FIXTURE_DIR);

    expect(session.harness).toBe("grok");
    expect(session.format).toBe("grok-chat-v1");
    expect(session.sessionId).toBe(SESSION_ID);
    expect(session.cwd).toBe("/workspace/grok-project");
    expect(session.model).toBe("grok-4.6");
    expect(session.startedAt).toBe("2026-09-12T10:00:00.000Z");
    expect(session.updatedAt).toBe("2026-09-12T10:05:00.000Z");
    expect(session.entries.length).toBe(10);
    expect(session.diagnostics).toEqual([]);
  });

  it("reads a chat_history.jsonl file directly via its sibling summary", async () => {
    const session = await readGrokSessionPath(CHAT_FILE);

    expect(session.sessionId).toBe(SESSION_ID);
    expect(session.cwd).toBe("/workspace/grok-project");
    expect(session.entries.length).toBe(10);
  });

  it("resolves the session id from the directory name without a summary", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harnie-grok-nosummary-"));
    temps.push(dir);
    const sessionDir = join(dir, "01nosummary000000000000000001");
    await mkdir(sessionDir, { recursive: true });
    await copyFile(CHAT_FILE, join(sessionDir, "chat_history.jsonl"));

    const session = await readGrokSessionPath(sessionDir);

    expect(session.sessionId).toBe("01nosummary000000000000000001");
    expect(session.cwd).toBeUndefined();
    expect(session.diagnostics.some((item) => item.code === "missing_summary")).toBe(true);
  });

  it("rejects a renamed bare transcript file with an actionable error", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harnie-grok-renamed-"));
    temps.push(dir);
    const renamed = join(dir, "transcript.jsonl");
    await copyFile(CHAT_FILE, renamed);

    await expect(readGrokSessionPath(renamed)).rejects.toThrow(/session id could not be determined/);
  });

  it("rejects an empty transcript with the expected chat_history shape", () => {
    expect(() => readGrokSessionText("", {
      path: "empty",
      chatPath: "empty/chat_history.jsonl",
      sessionDir: "empty",
    })).toThrow(/no chat entries/);
  });

  it("skips malformed lines with per-line diagnostics", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harnie-grok-malformed-"));
    temps.push(dir);
    await writeFile(join(dir, "chat_history.jsonl"), 'this is not json\n{"type":"user","content":[]}\n');

    const session = await readGrokSessionPath(dir);
    expect(session.entries.length).toBe(1);
    expect(session.diagnostics.some((item) => item.code === "malformed_jsonl")).toBe(true);
  });
});
