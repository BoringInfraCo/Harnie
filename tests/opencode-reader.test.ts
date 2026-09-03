import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  readOpenCodeSnapshotFile,
  readOpenCodeSnapshotText,
  readOpenCodeSqliteFile,
} from "../src/opencode/reader.js";

const FIXTURE = "tests/fixtures/opencode/sprint-012-handoff.json";

describe("OpenCode snapshot reader", () => {
  it("reads the sanitized sprint 012 fixture", async () => {
    const snapshot = await readOpenCodeSnapshotFile(FIXTURE);

    expect(snapshot.harness).toBe("opencode");
    expect(snapshot.format).toBe("opencode-session-v1");
    expect(snapshot.session.id).toBe("ses_f9b89b960ffeANOCU95mXvYqyM");
    expect(snapshot.session.directory).toBe("/workspace/harnie-project");
    expect(snapshot.messages.some((message) => message.data.role === "user")).toBe(true);
    expect(snapshot.parts.some((part) => part.data.type === "text" && part.data.text === "[SANITIZED ASSISTANT TEXT]")).toBe(true);
    expect(snapshot.parts.some((part) => part.data.type === "tool" && part.data.tool === "read" && part.data.state?.status === "completed")).toBe(true);
    expect(snapshot.parts.some((part) => part.data.type === "tool" && part.data.tool === "edit" && part.data.state?.status === "completed")).toBe(true);
  });

  it("does not contain the eval clone path in fixture text", async () => {
    const text = await readFile(FIXTURE, "utf8");
    expect(text).not.toContain("/private/tmp");
  });

  it("throws a clear error for invalid JSON", () => {
    expect(() => readOpenCodeSnapshotText("{", "/tmp/broken.json")).toThrow(/Invalid OpenCode snapshot JSON/);
  });

  it("rejects snapshots without harness, format, or session.id", () => {
    expect(() => readOpenCodeSnapshotText(JSON.stringify({
      harness: "pi",
      format: "opencode-session-v1",
      session: { id: "ses_1" },
      messages: [],
      parts: [],
    }))).toThrow(/harness must be "opencode"/);

    expect(() => readOpenCodeSnapshotText(JSON.stringify({
      harness: "opencode",
      format: "unknown",
      session: { id: "ses_1" },
      messages: [],
      parts: [],
    }))).toThrow(/format must be "opencode-session-v1"/);

    expect(() => readOpenCodeSnapshotText(JSON.stringify({
      harness: "opencode",
      format: "opencode-session-v1",
      session: {},
      messages: [],
      parts: [],
    }))).toThrow(/missing session\.id/);
  });
});

describe("OpenCode sqlite reader", () => {
  const temps: string[] = [];

  afterEach(async () => {
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("throws when the database file does not exist", () => {
    expect(() => readOpenCodeSqliteFile("/tmp/harnie-missing-opencode.db", "ses_1")).toThrow(
      /OpenCode SQLite file not found/,
    );
  });

  it("reads session, message, and part rows from a read-only database", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harnie-opencode-"));
    temps.push(dir);
    const dbPath = join(dir, "opencode.db");
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE session (
        id TEXT PRIMARY KEY,
        directory TEXT NOT NULL,
        title TEXT NOT NULL,
        agent TEXT,
        model TEXT,
        version TEXT,
        time_created INTEGER NOT NULL,
        time_updated INTEGER NOT NULL
      );
      CREATE TABLE message (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        time_created INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE part (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        time_created INTEGER NOT NULL,
        data TEXT NOT NULL
      );
    `);
    db.prepare(`
      INSERT INTO session (id, directory, title, agent, model, version, time_created, time_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "ses_test",
      "/workspace/harnie-project",
      "eval",
      "build",
      JSON.stringify({ id: "mimo-v2.5-free", providerID: "opencode" }),
      "1.18.26",
      1,
      2,
    );
    db.prepare("INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)").run(
      "msg_user",
      "ses_test",
      1,
      JSON.stringify({ role: "user", time: { created: 1 } }),
    );
    db.prepare("INSERT INTO part (id, message_id, session_id, time_created, data) VALUES (?, ?, ?, ?, ?)").run(
      "prt_read",
      "msg_user",
      "ses_test",
      2,
      JSON.stringify({
        type: "tool",
        tool: "read",
        callID: "call_1",
        state: { status: "completed", input: { filePath: "/workspace/harnie-project/src/cli/handoff.ts" } },
      }),
    );
    db.close();

    const snapshot = readOpenCodeSqliteFile(dbPath, "ses_test");
    expect(snapshot.harness).toBe("opencode");
    expect(snapshot.format).toBe("opencode-session-v1");
    expect(snapshot.session.id).toBe("ses_test");
    expect(snapshot.session.model).toEqual({ id: "mimo-v2.5-free", providerID: "opencode" });
    expect(snapshot.messages).toHaveLength(1);
    expect(snapshot.parts[0]?.data.type).toBe("tool");
    expect(() => readOpenCodeSqliteFile(dbPath, "ses_missing")).toThrow(/OpenCode session not found/);
  });
});
