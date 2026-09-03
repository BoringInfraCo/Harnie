import { existsSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runList } from "../src/cli/list.js";
import { runShow } from "../src/cli/show.js";
import { importPiSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";

const defaultHome = join(homedir(), ".harnie");
const defaultDb = join(defaultHome, "harnie.db");

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

const snapshotDefaultStore = () => ({
  exists: existsSync(defaultDb),
  mtimeMs: existsSync(defaultDb) ? statSync(defaultDb).mtimeMs : undefined,
});

describe("harnie list and show", () => {
  const homes: string[] = [];
  const defaultStoreBefore = snapshotDefaultStore();

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-inspect-"));
    homes.push(home);
    return home;
  };

  const seedTraceB = async (home: string): Promise<string> => {
    const store = initHarnieStore({ home });
    try {
      const result = await importPiSessionFile(store, "tests/fixtures/pi/trace-b-unfinished.jsonl");
      return result.workId;
    } finally {
      store.close();
    }
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
    const after = snapshotDefaultStore();
    expect(after.exists).toBe(defaultStoreBefore.exists);
    expect(after.mtimeMs).toBe(defaultStoreBefore.mtimeMs);
  });

  it("lists imported Trace B work id and workspace", async () => {
    const home = await makeHome();
    await seedTraceB(home);
    const stdout = capture();
    const stderr = capture();

    const code = await runList({ home, stdout, stderr });

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(stdout.toString()).toContain("work:pi:harnie-tb-da82c4f8");
    expect(stdout.toString()).toContain("/workspace/pi-project");
    expect(stdout.toString()).not.toMatch(/\bStatus\b/);
    expect(stdout.toString()).not.toMatch(/\bGoal\b/);
  });

  it("shows observed Trace B facts including unfinished tool activity", async () => {
    const home = await makeHome();
    const workId = await seedTraceB(home);
    const stdout = capture();
    const stderr = capture();

    const code = await runShow([workId], { home, stdout, stderr });

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(stdout.toString()).toContain("/workspace/pi-project");
    expect(stdout.toString()).toContain("pi");
    expect(stdout.toString()).toContain("tool_call");
    expect(stdout.toString()).toContain("missing_tool_result");
    expect(stdout.toString()).toMatch(/\bGoal\b/);
    expect(stdout.toString()).toMatch(/\bNext\b/);
    expect(stdout.toString()).not.toMatch(/\bDecisions\b/);
    expect(stdout.toString()).not.toMatch(/\bFindings\b/);
  });

  it("returns 1 when the work id is missing", async () => {
    const home = await makeHome();
    const stdout = capture();
    const stderr = capture();

    const code = await runShow([], { home, stdout, stderr });

    expect(code).toBe(1);
    expect(stdout.toString()).toBe("");
    expect(stderr.toString()).toMatch(/work id/i);
  });

  it("returns 1 when the work does not exist", async () => {
    const home = await makeHome();
    initHarnieStore({ home }).close();
    const stdout = capture();
    const stderr = capture();

    const code = await runShow(["work:pi:missing"], { home, stdout, stderr });

    expect(code).toBe(1);
    expect(stdout.toString()).toBe("");
    expect(stderr.toString()).toMatch(/not found/i);
  });

  it("lists an empty store with exit 0", async () => {
    const home = await makeHome();
    initHarnieStore({ home }).close();
    const stdout = capture();
    const stderr = capture();

    const code = await runList({ home, stdout, stderr });

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(stdout.toString()).toMatch(/no observed work/i);
  });
});
