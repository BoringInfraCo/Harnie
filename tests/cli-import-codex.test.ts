import { existsSync, readdirSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { runImport } from "../src/cli/import.js";
import { runList } from "../src/cli/list.js";
import { runShow } from "../src/cli/show.js";

const FIXTURE = "tests/fixtures/codex/unfinished-read.jsonl";
const WORK_ID = "work:codex:01codexunfinished000000000001";
const hasFixture = existsSync(FIXTURE);
const REAL_HARNIE_HOME = join(homedir(), ".harnie");
const REAL_CODEX_HOME = join(homedir(), ".codex");
const REAL_CODEX_SESSIONS = join(REAL_CODEX_HOME, "sessions");

if (!hasFixture) {
  console.warn(
    "Note: tests/fixtures/codex/unfinished-read.jsonl is not present; Codex rollout import tests are skipped.",
  );
}

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

const jsonlFiles = (root: string): string[] => {
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
    for (const path of jsonlFiles(REAL_CODEX_SESSIONS)) {
      const st = statSync(path);
      files.set(path, { mtimeMs: st.mtimeMs, size: st.size });
    }
  }
  return {
    existed,
    sessionsExisted,
    files,
  };
};

const expectCodexSessionsUnchanged = (before: ReturnType<typeof snapshotCodexSessions>): void => {
  if (!before.existed) {
    expect(existsSync(REAL_CODEX_HOME)).toBe(false);
    return;
  }
  if (!before.sessionsExisted) {
    expect(existsSync(REAL_CODEX_SESSIONS)).toBe(false);
    return;
  }
  const afterFiles = jsonlFiles(REAL_CODEX_SESSIONS);
  expect(afterFiles.sort()).toEqual([...before.files.keys()].sort());
  for (const path of afterFiles) {
    const st = statSync(path);
    const prior = before.files.get(path);
    expect(prior).toBeDefined();
    expect(st.mtimeMs).toBe(prior?.mtimeMs);
    expect(st.size).toBe(prior?.size);
  }
};

describe("harnie import codex", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-cli-import-codex-"));
    homes.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it.skipIf(!hasFixture)("imports the unfinished rollout and prints a work:codex id", async () => {
    const home = await makeHome();
    const stdout = capture();
    const stderr = capture();

    const code = await runImport(["codex", FIXTURE], { home, stdout, stderr });

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(stdout.toString()).toContain("Imported codex session.");
    expect(stdout.toString()).toContain(WORK_ID);
    expect(existsSync(join(home, "harnie.db"))).toBe(true);
  });

  it.skipIf(!hasFixture)("inserts 0 events on a second import of the same file", async () => {
    const home = await makeHome();
    const first = capture();
    const second = capture();

    expect(await runImport(["codex", FIXTURE], { home, stdout: first, stderr: capture() })).toBe(0);
    expect(await runImport(["codex", FIXTURE], { home, stdout: second, stderr: capture() })).toBe(0);
    expect(first.toString()).toContain(WORK_ID);
    expect(second.toString()).toMatch(/Events inserted\n0\n/);
  });

  it.skipIf(!hasFixture)("lists and shows the imported work including --quiet and src/cli.ts", async () => {
    const home = await makeHome();
    const imported = capture();

    expect(await runImport(["codex", FIXTURE], { home, stdout: imported, stderr: capture() })).toBe(0);
    expect(imported.toString()).toContain(WORK_ID);

    const listed = capture();
    const shown = capture();
    expect(await runList([], { home, stdout: listed, stderr: capture() })).toBe(0);
    expect(await runShow([WORK_ID], { home, stdout: shown, stderr: capture() })).toBe(0);
    expect(listed.toString()).toContain(WORK_ID);
    expect(shown.toString()).toContain(WORK_ID);
    expect(shown.toString()).toContain("--quiet");
    expect(shown.toString()).toContain("src/cli.ts");
  });

  it.skipIf(!hasFixture)("imports and shows through runCli", async () => {
    const home = await makeHome();
    const imported = capture();
    const shown = capture();

    expect(await runCli(["import", "codex", FIXTURE], { home, stdout: imported, stderr: capture() })).toBe(
      0,
    );
    expect(await runCli(["show", WORK_ID], { home, stdout: shown, stderr: capture() })).toBe(0);
    expect(imported.toString()).toContain(WORK_ID);
    expect(shown.toString()).toContain(WORK_ID);
    expect(shown.toString()).toContain("--quiet");
    expect(shown.toString()).toContain("src/cli.ts");
  });

  it("prints usage and exits 1 when the path or harness is missing", async () => {
    const empty = capture();
    const harnessOnly = capture();

    expect(await runImport([], { stdout: capture(), stderr: empty })).toBe(1);
    expect(empty.toString()).toMatch(/usage: harnie import pi/i);
    expect(empty.toString()).toMatch(/harnie import codex/i);

    expect(await runImport(["codex"], { stdout: capture(), stderr: harnessOnly })).toBe(1);
    expect(harnessOnly.toString()).toMatch(/usage: harnie import pi/i);
    expect(harnessOnly.toString()).toMatch(/harnie import codex/i);
  });

  it("never writes ~/.harnie", async () => {
    const before = snapshotRealHome();
    const home = await makeHome();

    if (hasFixture) {
      expect(await runImport(["codex", FIXTURE], { home, stdout: capture(), stderr: capture() })).toBe(0);
      expect(existsSync(join(home, "harnie.db"))).toBe(true);
    }
    expect(await runImport([], { stdout: capture(), stderr: capture() })).toBe(1);
    expect(await runImport(["codex"], { stdout: capture(), stderr: capture() })).toBe(1);

    expectRealHomeUnchanged(before);
  });

  it("never creates files under ~/.codex", async () => {
    const before = snapshotCodexSessions();
    const home = await makeHome();

    if (hasFixture) {
      expect(await runImport(["codex", FIXTURE], { home, stdout: capture(), stderr: capture() })).toBe(0);
    }
    expect(await runImport([], { stdout: capture(), stderr: capture() })).toBe(1);
    expect(await runImport(["codex"], { stdout: capture(), stderr: capture() })).toBe(1);

    expectCodexSessionsUnchanged(before);
  });
});
