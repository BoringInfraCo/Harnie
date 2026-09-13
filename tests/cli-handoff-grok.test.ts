import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHandoff } from "../src/cli/handoff.js";
import { importGrokSessionPath, importPiSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";

const GROK_FIXTURE = "tests/fixtures/grok/unfinished-demo";
const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";
const REAL_HARNIE_HOME = join(homedir(), ".harnie");
const REAL_GROK_HOME = join(homedir(), ".grok");
const REAL_GROK_SESSIONS = join(REAL_GROK_HOME, "sessions");

const capture = () => {
  let output = "";
  return {
    write(chunk: string) {
      output += chunk;
    },
    toString() {
      return output;
    },
  };
};

const snapshotRealHome = () => {
  const existed = existsSync(REAL_HARNIE_HOME);
  const dbPath = join(REAL_HARNIE_HOME, "harnie.db");
  const dbExisted = existsSync(dbPath);
  return {
    existed,
    dbExisted,
    mtimeMs: existed ? statSync(REAL_HARNIE_HOME).mtimeMs : undefined,
    dbMtimeMs: dbExisted ? statSync(dbPath).mtimeMs : undefined,
    dbSize: dbExisted ? statSync(dbPath).size : undefined,
  };
};

const expectRealHomeUnchanged = (before: ReturnType<typeof snapshotRealHome>): void => {
  const dbPath = join(REAL_HARNIE_HOME, "harnie.db");
  if (!before.existed) {
    expect(existsSync(REAL_HARNIE_HOME)).toBe(false);
    return;
  }
  expect(statSync(REAL_HARNIE_HOME).mtimeMs).toBe(before.mtimeMs);
  if (!before.dbExisted) {
    expect(existsSync(dbPath)).toBe(false);
    return;
  }
  const db = statSync(dbPath);
  expect(db.mtimeMs).toBe(before.dbMtimeMs);
  expect(db.size).toBe(before.dbSize);
};

const transcriptFiles = (root: string): string[] => {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === "chat_history.jsonl") found.push(path);
    }
  };
  walk(root);
  return found;
};

const snapshotGrokSessions = () => {
  const existed = existsSync(REAL_GROK_HOME);
  const sessionsExisted = existsSync(REAL_GROK_SESSIONS);
  const files = new Map<string, { mtimeMs: number; size: number }>();
  if (sessionsExisted) {
    for (const path of transcriptFiles(REAL_GROK_SESSIONS)) {
      const st = statSync(path);
      files.set(path, { mtimeMs: st.mtimeMs, size: st.size });
    }
  }
  return { existed, sessionsExisted, files };
};

const expectGrokSessionsUnchanged = (before: ReturnType<typeof snapshotGrokSessions>): void => {
  if (!before.existed) {
    expect(existsSync(REAL_GROK_HOME)).toBe(false);
    return;
  }
  if (!before.sessionsExisted) {
    expect(existsSync(REAL_GROK_SESSIONS)).toBe(false);
  } else {
    const afterFiles = transcriptFiles(REAL_GROK_SESSIONS);
    expect(afterFiles.sort()).toEqual([...before.files.keys()].sort());
    for (const path of afterFiles) {
      const st = statSync(path);
      const prior = before.files.get(path);
      expect(prior).toBeDefined();
      expect(st.mtimeMs).toBe(prior?.mtimeMs);
      expect(st.size).toBe(prior?.size);
    }
  }
};

const grokHandoffFiles = (home: string): string[] => {
  const directory = join(home, "handoffs");
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith(".grok.md"));
};

describe("harnie handoff --to grok", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-cli-handoff-grok-"));
    homes.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("prints a Grok handoff for Grok-imported work and writes .grok.md", async () => {
    const home = await makeHome();
    const store = initHarnieStore({ home });
    let workId: string;
    try {
      workId = (await importGrokSessionPath(store, GROK_FIXTURE)).workId;
    } finally {
      store.close();
    }

    const stdout = capture();
    const stderr = capture();
    const code = await runHandoff([workId, "--to", "grok"], { home, stdout, stderr });
    const output = stdout.toString();
    const files = grokHandoffFiles(home);

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(output).toMatch(/for Grok/i);
    expect(output).toMatch(/continue/i);
    expect(output).not.toMatch(/chat_history\.jsonl.*\{/);
    expect(files.length).toBe(1);
    expect(readFileSync(join(home, "handoffs", files[0] ?? ""), "utf8")).toBe(output);
    expect(transcriptFiles(home)).toEqual([]);
  });

  it("keeps Trace B unresolved without claiming investigation complete", async () => {
    const home = await makeHome();
    const store = initHarnieStore({ home });
    let workId: string;
    try {
      workId = (await importPiSessionFile(store, TRACE_B)).workId;
    } finally {
      store.close();
    }

    const stdout = capture();
    const stderr = capture();
    const code = await runHandoff([workId, "--to", "grok"], { home, stdout, stderr });
    const output = stdout.toString();

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(output).toMatch(/unresolved|pending/i);
    expect(output).not.toMatch(/complete[- ]investigation|investigation (is |was )?complete/i);
    expect(grokHandoffFiles(home).length).toBe(1);
    expect(transcriptFiles(home)).toEqual([]);
  });

  it("never writes ~/.harnie or ~/.grok sessions", async () => {
    const beforeHome = snapshotRealHome();
    const beforeGrok = snapshotGrokSessions();
    const home = await makeHome();
    const store = initHarnieStore({ home });
    let workId: string;
    try {
      workId = (await importGrokSessionPath(store, GROK_FIXTURE)).workId;
    } finally {
      store.close();
    }

    expect(await runHandoff([workId, "--to", "grok"], { home, stdout: capture(), stderr: capture() })).toBe(0);
    expect(await runHandoff(["work:grok:abc", "--to", "foobar"], { stdout: capture(), stderr: capture() })).toBe(1);

    expect(existsSync(join(home, "harnie.db"))).toBe(true);
    expect(transcriptFiles(home)).toEqual([]);
    expectRealHomeUnchanged(beforeHome);
    expectGrokSessionsUnchanged(beforeGrok);
  });
});
