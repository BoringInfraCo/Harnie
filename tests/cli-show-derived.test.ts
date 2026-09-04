import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runShow } from "../src/cli/show.js";
import { importPiSessionFile } from "../src/engine/import.js";
import { observePiSession } from "../src/pi/observe.js";
import { readPiJsonlFile } from "../src/pi/reader.js";
import { initHarnieStore } from "../src/store/database.js";
import { persistObservedWork } from "../src/store/persist.js";

const FIXTURE_C = "tests/fixtures/pi/stateful-prefix.jsonl";
const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";

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

describe("harnie show derived claims", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-show-derived-"));
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

  it("shows Fixture C goal and decision from derived work", async () => {
    const home = await makeHome();
    const workId = await seedImported(home, FIXTURE_C);
    const stdout = capture();
    const stderr = capture();

    const code = await runShow([workId], { home, stdout, stderr });
    const output = stdout.toString();

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(output).toMatch(/Goal/);
    expect(output).toMatch(/5\.3|xhigh/);
    expect(output).toMatch(/Decisions/);
    expect(output).toMatch(/I will/i);
    expect(output).toContain("Events");
    expect(output).toContain("Workspace");
    expect(output).not.toMatch(/\bStatus\b/);
    expect(output).toMatch(/Do not re-edit|Verify the edits/);
  });

  it("shows Trace B next step without inventing completion", async () => {
    const home = await makeHome();
    const workId = await seedImported(home, TRACE_B);
    const stdout = capture();
    const stderr = capture();

    const code = await runShow([workId], { home, stdout, stderr });
    const output = stdout.toString();

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(output).toMatch(/Next/);
    expect(output).toContain("Events");
    expect(output).not.toMatch(/investigation (is |was )?complete/i);
    expect(output).not.toMatch(/refactoring plan ready/i);
    expect(output).not.toMatch(/\bStatus\b/);
  });

  it("omits Decisions when work is persisted without derive", async () => {
    const home = await makeHome();
    const store = initHarnieStore({ home });
    let workId: string;
    try {
      const observed = observePiSession(await readPiJsonlFile(FIXTURE_C));
      persistObservedWork(store, observed);
      workId = observed.id;
    } finally {
      store.close();
    }

    const stdout = capture();
    const stderr = capture();
    const code = await runShow([workId], { home, stdout, stderr });
    const output = stdout.toString();

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(output).not.toMatch(/\bDecisions\b/);
    expect(output).not.toMatch(/\bGoal\b/);
    expect(output).not.toMatch(/\bFindings\b/);
    expect(output).toMatch(/Verify the edits/);
    expect(output).toContain("Events");
    expect(output).toContain("Workspace");
  });
});
