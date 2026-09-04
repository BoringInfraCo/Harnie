import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runDiff } from "../src/cli/diff.js";
import { runExecutions } from "../src/cli/executions.js";
import { runHistory } from "../src/cli/history.js";
import { runImport } from "../src/cli/import.js";
import { initHarnieStore } from "../src/store/database.js";
import { loadWork } from "../src/store/persist.js";

const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";
const CODEX = "tests/fixtures/codex/unfinished-read.jsonl";
const PI_WORK_ID = "work:pi:harnie-tb-da82c4f8";

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

describe("harnie executions history diff", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-cli-work-history-"));
    homes.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  const seedAttached = async (home: string): Promise<{ piExecutionId: string; codexExecutionId: string }> => {
    expect(await runImport(["pi", TRACE_B], { home, stdout: capture(), stderr: capture() })).toBe(0);
    expect(
      await runImport(["codex", CODEX, "--work", PI_WORK_ID], {
        home,
        stdout: capture(),
        stderr: capture(),
      }),
    ).toBe(0);
    const store = initHarnieStore({ home });
    try {
      const loaded = loadWork(store, PI_WORK_ID);
      expect(loaded).toBeDefined();
      expect(loaded?.executions).toHaveLength(2);
      const ids = (loaded?.executions ?? []).map((execution) => execution.id);
      const piExecutionId = (loaded?.executions ?? []).find((execution) => execution.harness === "pi")?.id ?? ids[0] ?? "";
      const codexExecutionId =
        (loaded?.executions ?? []).find((execution) => execution.harness === "codex")?.id ?? ids[1] ?? "";
      expect(piExecutionId).not.toBe("");
      expect(codexExecutionId).not.toBe("");
      return { piExecutionId, codexExecutionId };
    } finally {
      store.close();
    }
  };

  it("lists executions with ids, harnesses, and event counts", async () => {
    const home = await makeHome();
    const { piExecutionId, codexExecutionId } = await seedAttached(home);
    const stdout = capture();
    const stderr = capture();

    const code = await runExecutions([PI_WORK_ID], { home, stdout, stderr });

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    const output = stdout.toString();
    expect(output).toContain(PI_WORK_ID);
    expect(output).toContain(piExecutionId);
    expect(output).toContain(codexExecutionId);
    expect(output).toContain("pi");
    expect(output).toContain("codex");
    expect(output).toContain("message");
    expect(output).toContain("tool_call");
    expect(output).toContain("tool_result");
  });

  it("shows history with harnesses, goal, and first-user text", async () => {
    const home = await makeHome();
    await seedAttached(home);
    const stdout = capture();
    const stderr = capture();

    const code = await runHistory([PI_WORK_ID], { home, stdout, stderr });

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    const output = stdout.toString();
    expect(output).toContain("pi");
    expect(output).toContain("codex");
    expect(output).toContain("Goal");
    expect(output).toContain("Investigate this project thoroughly");
  });

  it("diffs pi to codex with Diff header and added src/cli.ts", async () => {
    const home = await makeHome();
    const { piExecutionId, codexExecutionId } = await seedAttached(home);
    const stdout = capture();
    const stderr = capture();

    const code = await runDiff([PI_WORK_ID, piExecutionId, codexExecutionId], {
      home,
      stdout,
      stderr,
    });

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    const output = stdout.toString();
    expect(output).toContain("Diff");
    expect(output).toContain(piExecutionId);
    expect(output).toContain(codexExecutionId);
    expect(output).toContain("src/cli.ts");
    expect(output).toMatch(/^\+ /m);
  });

  it("reports usage when diff args are missing", async () => {
    const home = await makeHome();
    await seedAttached(home);
    for (const argv of [[], [PI_WORK_ID], [PI_WORK_ID, "a"]] as const) {
      const stdout = capture();
      const stderr = capture();
      const code = await runDiff([...argv], { home, stdout, stderr });
      expect(code).toBe(1);
      expect(stderr.toString()).toMatch(/usage/i);
      expect(stdout.toString()).toBe("");
    }
  });

  it("reports missing work id for executions and history", async () => {
    const home = await makeHome();
    const executionsStderr = capture();
    expect(await runExecutions([], { home, stdout: capture(), stderr: executionsStderr })).toBe(1);
    expect(executionsStderr.toString()).toMatch(/work id/i);
    const historyStderr = capture();
    expect(await runHistory([], { home, stdout: capture(), stderr: historyStderr })).toBe(1);
    expect(historyStderr.toString()).toMatch(/work id/i);
  });

  it("reports not found for unknown work", async () => {
    const home = await makeHome();
    initHarnieStore({ home }).close();
    const missing = "work:pi:does-not-exist";
    const executionsStderr = capture();
    expect(await runExecutions([missing], { home, stdout: capture(), stderr: executionsStderr })).toBe(1);
    expect(executionsStderr.toString()).toMatch(/not found/);
    const historyStderr = capture();
    expect(await runHistory([missing], { home, stdout: capture(), stderr: historyStderr })).toBe(1);
    expect(historyStderr.toString()).toMatch(/not found/);
    const diffStderr = capture();
    expect(
      await runDiff([missing, "execution:a", "execution:b"], {
        home,
        stdout: capture(),
        stderr: diffStderr,
      }),
    ).toBe(1);
    expect(diffStderr.toString()).toMatch(/not found/);
  });

  it("reports Execution not found for unknown execution", async () => {
    const home = await makeHome();
    const { piExecutionId } = await seedAttached(home);
    const stdout = capture();
    const stderr = capture();
    const code = await runDiff([PI_WORK_ID, piExecutionId, "execution:pi:does-not-exist"], {
      home,
      stdout,
      stderr,
    });
    expect(code).toBe(1);
    expect(stderr.toString()).toMatch(/Execution not found/);
  });

  it("emits no added or removed lines when diffing an execution with itself", async () => {
    const home = await makeHome();
    const { piExecutionId } = await seedAttached(home);
    const stdout = capture();
    const stderr = capture();
    const code = await runDiff([PI_WORK_ID, piExecutionId, piExecutionId], {
      home,
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    const output = stdout.toString();
    expect(output).toContain("Diff");
    expect(output).not.toMatch(/^\+ /m);
    expect(output).not.toMatch(/^- /m);
  });
});
