import { existsSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runImport } from "../src/cli/import.js";

const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";
const REAL_HARNIE_HOME = join(homedir(), ".harnie");

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

describe("harnie import", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-cli-import-"));
    homes.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("imports Trace B and prints the work id", async () => {
    const home = await makeHome();
    const stdout = capture();
    const stderr = capture();

    const code = await runImport(["pi", TRACE_B], { home, stdout, stderr });

    expect(code).toBe(0);
    expect(stdout.toString()).toContain("work:pi:harnie-tb-da82c4f8");
    expect(existsSync(join(home, "harnie.db"))).toBe(true);
  });

  it("inserts 0 events on a second import of the same file", async () => {
    const home = await makeHome();
    const first = capture();
    const second = capture();

    expect(await runImport(["pi", TRACE_B], { home, stdout: first, stderr: capture() })).toBe(0);
    expect(await runImport(["pi", TRACE_B], { home, stdout: second, stderr: capture() })).toBe(0);
    expect(second.toString()).toMatch(/Events inserted\n0\n/);
  });

  it("prints usage and exits 1 when the path is missing", async () => {
    const empty = capture();
    const piOnly = capture();

    expect(await runImport([], { stdout: capture(), stderr: empty })).toBe(1);
    expect(empty.toString()).toMatch(/usage: harnie import pi/i);

    expect(await runImport(["pi"], { stdout: capture(), stderr: piOnly })).toBe(1);
    expect(piOnly.toString()).toMatch(/usage: harnie import pi/i);
  });

  it("exits 1 for an unsupported harness", async () => {
    const stderr = capture();

    const code = await runImport(["opencode", TRACE_B], { stdout: capture(), stderr });

    expect(code).toBe(1);
    expect(stderr.toString()).toMatch(/not implemented/i);
  });

  it("never writes ~/.harnie", async () => {
    const before = snapshotRealHome();
    const home = await makeHome();

    expect(await runImport(["pi", TRACE_B], { home, stdout: capture(), stderr: capture() })).toBe(0);
    expect(await runImport([], { stdout: capture(), stderr: capture() })).toBe(1);
    expect(await runImport(["opencode", TRACE_B], { stdout: capture(), stderr: capture() })).toBe(1);

    expect(existsSync(join(home, "harnie.db"))).toBe(true);
    expectRealHomeUnchanged(before);
  });
});
