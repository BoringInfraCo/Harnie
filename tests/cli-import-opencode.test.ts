import { existsSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runImport } from "../src/cli/import.js";
import { runList } from "../src/cli/list.js";
import { runShow } from "../src/cli/show.js";

const FIXTURE = "tests/fixtures/opencode/sprint-012-handoff.json";
const hasFixture = existsSync(FIXTURE);
const REAL_HARNIE_HOME = join(homedir(), ".harnie");

if (!hasFixture) {
  console.warn(
    "Note: tests/fixtures/opencode/sprint-012-handoff.json is not present; OpenCode snapshot import tests are skipped.",
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

const workIdFromImport = (stdout: string): string => {
  const match = stdout.match(/work:opencode:\S+/);
  expect(match?.[0]).toBeDefined();
  return match?.[0] ?? "";
};

describe("harnie import opencode", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-cli-import-opencode-"));
    homes.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it.skipIf(!hasFixture)("imports the Sprint 012 snapshot and prints a work:opencode id", async () => {
    const home = await makeHome();
    const stdout = capture();
    const stderr = capture();

    const code = await runImport(["opencode", FIXTURE], { home, stdout, stderr });

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(stdout.toString()).toContain("Imported opencode session.");
    expect(stdout.toString()).toContain("work:opencode:");
    expect(existsSync(join(home, "harnie.db"))).toBe(true);
  });

  it.skipIf(!hasFixture)("inserts 0 events on a second import of the same file", async () => {
    const home = await makeHome();
    const first = capture();
    const second = capture();

    expect(await runImport(["opencode", FIXTURE], { home, stdout: first, stderr: capture() })).toBe(0);
    expect(await runImport(["opencode", FIXTURE], { home, stdout: second, stderr: capture() })).toBe(0);
    expect(first.toString()).toContain("work:opencode:");
    expect(second.toString()).toMatch(/Events inserted\n0\n/);
  });

  it.skipIf(!hasFixture)("lists and shows the imported work without crashing", async () => {
    const home = await makeHome();
    const imported = capture();

    expect(await runImport(["opencode", FIXTURE], { home, stdout: imported, stderr: capture() })).toBe(0);
    const workId = workIdFromImport(imported.toString());

    const listed = capture();
    const shown = capture();
    expect(await runList({ home, stdout: listed, stderr: capture() })).toBe(0);
    expect(await runShow([workId], { home, stdout: shown, stderr: capture() })).toBe(0);
    expect(listed.toString()).toContain(workId);
    expect(shown.toString()).toContain(workId);
  });

  it("prints usage and exits 1 when the path is missing", async () => {
    const empty = capture();
    const harnessOnly = capture();

    expect(await runImport([], { stdout: capture(), stderr: empty })).toBe(1);
    expect(empty.toString()).toMatch(/usage: harnie import pi/i);
    expect(empty.toString()).toMatch(/harnie import opencode/i);

    expect(await runImport(["opencode"], { stdout: capture(), stderr: harnessOnly })).toBe(1);
    expect(harnessOnly.toString()).toMatch(/usage: harnie import pi/i);
    expect(harnessOnly.toString()).toMatch(/harnie import opencode/i);
  });

  it("exits 1 for an unknown harness", async () => {
    const stderr = capture();

    const code = await runImport(["codex", FIXTURE], { stdout: capture(), stderr });

    expect(code).toBe(1);
    expect(stderr.toString()).toMatch(/not implemented/i);
  });

  it("never writes ~/.harnie", async () => {
    const before = snapshotRealHome();
    const home = await makeHome();

    if (hasFixture) {
      expect(await runImport(["opencode", FIXTURE], { home, stdout: capture(), stderr: capture() })).toBe(0);
      expect(existsSync(join(home, "harnie.db"))).toBe(true);
    }
    expect(await runImport([], { stdout: capture(), stderr: capture() })).toBe(1);
    expect(await runImport(["opencode"], { stdout: capture(), stderr: capture() })).toBe(1);
    expect(await runImport(["codex", FIXTURE], { stdout: capture(), stderr: capture() })).toBe(1);

    expectRealHomeUnchanged(before);
  });
});
