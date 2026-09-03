import { existsSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHandoff } from "../src/cli/handoff.js";
import { importPiSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";

const FIXTURE_C = "tests/fixtures/pi/stateful-prefix.jsonl";
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

describe("harnie handoff", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-cli-handoff-"));
    homes.push(home);
    return home;
  };

  const seedImported = async (home: string, path: string): Promise<string> => {
    const store = initHarnieStore({ home });
    try {
      return (await importPiSessionFile(store, path)).workId;
    } finally {
      store.close();
    }
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("prints an OpenCode handoff for Fixture C", async () => {
    const home = await makeHome();
    const workId = await seedImported(home, FIXTURE_C);
    const stdout = capture();
    const stderr = capture();

    const code = await runHandoff([workId, "--to", "opencode"], { home, stdout, stderr });
    const output = stdout.toString();

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(output).toMatch(/continue/i);
    expect(output).toMatch(/xhigh|5\.3/i);
    expect(output).toMatch(/I will/i);
  });

  it("keeps Trace B unresolved without claiming completion", async () => {
    const home = await makeHome();
    const workId = await seedImported(home, TRACE_B);
    const stdout = capture();
    const stderr = capture();

    const code = await runHandoff([workId, "--to", "opencode"], { home, stdout, stderr });
    const output = stdout.toString();

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(output).toMatch(/pending tool call|Unresolved/i);
    expect(output).not.toMatch(/investigation (is |was )?complete/i);
  });

  it("prints usage and exits 1 when --to is missing", async () => {
    const stderr = capture();

    const code = await runHandoff(["work:pi:abc"], { stdout: capture(), stderr });

    expect(code).toBe(1);
    expect(stderr.toString()).toMatch(/usage: harnie handoff/i);
  });

  it("prints usage and exits 1 when the work id is missing", async () => {
    const stderr = capture();

    const code = await runHandoff(["--to", "opencode"], { stdout: capture(), stderr });

    expect(code).toBe(1);
    expect(stderr.toString()).toMatch(/usage: harnie handoff/i);
  });

  it("exits 1 for an unsupported --to target", async () => {
    const stderr = capture();

    const code = await runHandoff(["work:pi:abc", "--to", "foobar"], { stdout: capture(), stderr });

    expect(code).toBe(1);
    expect(stderr.toString()).toMatch(/not implemented/i);
  });

  it("exits 1 when the work does not exist", async () => {
    const home = await makeHome();
    initHarnieStore({ home }).close();
    const stdout = capture();
    const stderr = capture();

    const code = await runHandoff(["work:pi:missing", "--to", "opencode"], { home, stdout, stderr });

    expect(code).toBe(1);
    expect(stdout.toString()).toBe("");
    expect(stderr.toString()).toMatch(/not found/i);
  });

  it("never writes ~/.harnie", async () => {
    const before = snapshotRealHome();
    const home = await makeHome();
    const workId = await seedImported(home, FIXTURE_C);

    expect(await runHandoff([workId, "--to", "opencode"], { home, stdout: capture(), stderr: capture() })).toBe(0);
    expect(await runHandoff(["work:pi:abc"], { stdout: capture(), stderr: capture() })).toBe(1);
    expect(await runHandoff(["work:pi:abc", "--to", "foobar"], { stdout: capture(), stderr: capture() })).toBe(1);
    expect(await runHandoff(["work:pi:missing", "--to", "opencode"], { home, stdout: capture(), stderr: capture() })).toBe(1);

    expect(existsSync(join(home, "harnie.db"))).toBe(true);
    expectRealHomeUnchanged(before);
  });
});
