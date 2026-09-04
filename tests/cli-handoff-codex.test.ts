import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHandoff } from "../src/cli/handoff.js";
import { importCodexSessionFile, importPiSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";

const CODEX_FIXTURE = "tests/fixtures/codex/unfinished-read.jsonl";
const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";
const REAL_HARNIE_HOME = join(homedir(), ".harnie");
const REAL_CODEX_HOME = join(homedir(), ".codex");
const REAL_CODEX_SESSIONS = join(REAL_CODEX_HOME, "sessions");

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

const rolloutFiles = (root: string): string[] => {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".jsonl")) found.push(path);
    }
  };
  walk(root);
  return found;
};

const snapshotCodexSessions = () => {
  const existed = existsSync(REAL_CODEX_HOME);
  const sessionsExisted = existsSync(REAL_CODEX_SESSIONS);
  const files = new Map<string, { mtimeMs: number; size: number }>();
  if (sessionsExisted) {
    for (const path of rolloutFiles(REAL_CODEX_SESSIONS)) {
      const st = statSync(path);
      files.set(path, { mtimeMs: st.mtimeMs, size: st.size });
    }
  }
  return { existed, sessionsExisted, files };
};

const expectCodexSessionsUnchanged = (before: ReturnType<typeof snapshotCodexSessions>): void => {
  if (!before.existed) {
    expect(existsSync(REAL_CODEX_HOME)).toBe(false);
    return;
  }
  if (!before.sessionsExisted) {
    expect(existsSync(REAL_CODEX_SESSIONS)).toBe(false);
  } else {
    const afterFiles = rolloutFiles(REAL_CODEX_SESSIONS);
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

const codexHandoffFiles = (home: string): string[] => {
  const directory = join(home, "handoffs");
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith(".codex.md"));
};

describe("harnie handoff --to codex", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-cli-handoff-codex-"));
    homes.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("prints a Codex handoff for Codex-imported work and writes .codex.md", async () => {
    const home = await makeHome();
    const store = initHarnieStore({ home });
    let workId: string;
    try {
      workId = (await importCodexSessionFile(store, CODEX_FIXTURE)).workId;
    } finally {
      store.close();
    }

    const stdout = capture();
    const stderr = capture();
    const code = await runHandoff([workId, "--to", "codex"], { home, stdout, stderr });
    const output = stdout.toString();
    const files = codexHandoffFiles(home);

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(output).toMatch(/for Codex/i);
    expect(output).toMatch(/continue/i);
    expect(output).not.toMatch(/"type":"response_item"/);
    expect(files.length).toBe(1);
    expect(readFileSync(join(home, "handoffs", files[0] ?? ""), "utf8")).toBe(output);
    expect(rolloutFiles(home)).toEqual([]);
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
    const code = await runHandoff([workId, "--to", "codex"], { home, stdout, stderr });
    const output = stdout.toString();

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(output).toMatch(/unresolved|pending/i);
    expect(output).not.toMatch(/complete[- ]investigation|investigation (is |was )?complete/i);
    expect(codexHandoffFiles(home).length).toBe(1);
    expect(rolloutFiles(home)).toEqual([]);
  });

  it("never writes ~/.harnie or ~/.codex sessions", async () => {
    const beforeHome = snapshotRealHome();
    const beforeCodex = snapshotCodexSessions();
    const home = await makeHome();
    const store = initHarnieStore({ home });
    let workId: string;
    try {
      workId = (await importCodexSessionFile(store, CODEX_FIXTURE)).workId;
    } finally {
      store.close();
    }

    expect(await runHandoff([workId, "--to", "codex"], { home, stdout: capture(), stderr: capture() })).toBe(0);
    expect(await runHandoff(["work:codex:abc", "--to", "foobar"], { stdout: capture(), stderr: capture() })).toBe(1);

    expect(existsSync(join(home, "harnie.db"))).toBe(true);
    expect(rolloutFiles(home)).toEqual([]);
    expectRealHomeUnchanged(beforeHome);
    expectCodexSessionsUnchanged(beforeCodex);
  });
});
