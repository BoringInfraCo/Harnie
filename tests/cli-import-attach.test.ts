import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { runImport } from "../src/cli/import.js";
import { initHarnieStore } from "../src/store/database.js";
import { loadWork } from "../src/store/persist.js";
import { listWorks } from "../src/store/query.js";
import { buildHandoffFromWork } from "../src/work/handoff.js";
import type { Work } from "../src/work/types.js";

const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";
const CODEX = "tests/fixtures/codex/unfinished-read.jsonl";
const PI_WORK_ID = "work:pi:harnie-tb-da82c4f8";
const CODEX_WORK_ID = "work:codex:01codexunfinished000000000001";
const PI_EXECUTION_ID = "execution:pi:harnie-tb-da82c4f8";
const CODEX_EXECUTION_ID = "execution:codex:01codexunfinished000000000001";

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

const eventsInsertedFromStdout = (stdout: string): number => {
  const match = stdout.match(/Events inserted\n(\d+)\n/);
  expect(match?.[1]).toBeDefined();
  return Number(match?.[1]);
};

describe("harnie import --work attach", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-cli-import-attach-"));
    homes.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("attaches a pi session to an existing codex work", async () => {
    const home = await makeHome();
    const firstStdout = capture();
    const firstStderr = capture();
    expect(await runImport(["codex", CODEX], { home, stdout: firstStdout, stderr: firstStderr })).toBe(0);
    expect(firstStdout.toString()).toContain(CODEX_WORK_ID);
    const firstInserted = eventsInsertedFromStdout(firstStdout.toString());
    expect(firstInserted).toBeGreaterThan(0);

    const stdout = capture();
    const stderr = capture();
    const code = await runImport(["pi", TRACE_B, "--work", CODEX_WORK_ID], {
      home,
      stdout,
      stderr,
    });
    const attachedInserted = eventsInsertedFromStdout(stdout.toString());

    expect(code).toBe(0);
    expect(stdout.toString()).toContain("Imported pi session.");
    expect(stdout.toString()).toContain(CODEX_WORK_ID);
    expect(stdout.toString()).toMatch(/Events inserted\n\d+\n/);
    expect(attachedInserted).toBeGreaterThan(0);

    const store = initHarnieStore({ home });
    try {
      const loaded = loadWork(store, CODEX_WORK_ID);
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(CODEX_WORK_ID);
      expect(loaded?.executions).toHaveLength(2);
      expect(loaded?.executions.map((execution) => execution.id)).toEqual(
        expect.arrayContaining([PI_EXECUTION_ID, CODEX_EXECUTION_ID]),
      );
      expect(loaded?.events.length).toBe(firstInserted + attachedInserted);
      expect(loaded?.events.every((event) => event.workId === CODEX_WORK_ID)).toBe(true);
      expect(loaded?.events.some((event) => event.executionId === PI_EXECUTION_ID)).toBe(true);
      expect(loaded?.events.some((event) => event.executionId === CODEX_EXECUTION_ID)).toBe(true);
    } finally {
      store.close();
    }
  });

  it("parses --work before positional args", async () => {
    const home = await makeHome();
    const firstStdout = capture();
    expect(
      await runImport(["codex", CODEX], { home, stdout: firstStdout, stderr: capture() }),
    ).toBe(0);
    expect(firstStdout.toString()).toContain(CODEX_WORK_ID);

    const stdout = capture();
    const stderr = capture();
    const code = await runImport(["--work", CODEX_WORK_ID, "pi", TRACE_B], {
      home,
      stdout,
      stderr,
    });

    expect(code).toBe(0);
    expect(stdout.toString()).toContain("Imported pi session.");
    expect(stdout.toString()).toContain(CODEX_WORK_ID);
    expect(stdout.toString()).toMatch(/Events inserted\n\d+\n/);

    const store = initHarnieStore({ home });
    try {
      const loaded = loadWork(store, CODEX_WORK_ID);
      expect(loaded?.executions).toHaveLength(2);
      expect(loaded?.executions.map((execution) => execution.id)).toEqual(
        expect.arrayContaining([PI_EXECUTION_ID, CODEX_EXECUTION_ID]),
      );
    } finally {
      store.close();
    }
  });

  it("exits 1 when the target work does not exist", async () => {
    const home = await makeHome();
    const stdout = capture();
    const stderr = capture();

    const code = await runImport(["pi", TRACE_B, "--work", "work:pi:does-not-exist"], {
      home,
      stdout,
      stderr,
    });

    expect(code).toBe(1);
    expect(stderr.toString()).toMatch(/Work not found/);
  });

  it("exits 1 with usage when --work has no value", async () => {
    const home = await makeHome();
    const stdout = capture();
    const stderr = capture();

    const code = await runImport(["pi", TRACE_B, "--work"], { home, stdout, stderr });

    expect(code).toBe(1);
    expect(stderr.toString()).toMatch(/usage/i);
  });

  it("keeps a single listWorks row after attach", async () => {
    const home = await makeHome();
    expect(
      await runImport(["codex", CODEX], { home, stdout: capture(), stderr: capture() }),
    ).toBe(0);
    const stdout = capture();
    expect(
      await runImport(["pi", TRACE_B, "--work", CODEX_WORK_ID], {
        home,
        stdout,
        stderr: capture(),
      }),
    ).toBe(0);
    expect(stdout.toString()).toContain(CODEX_WORK_ID);

    const store = initHarnieStore({ home });
    try {
      const rows = listWorks(store);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(CODEX_WORK_ID);
    } finally {
      store.close();
    }
  });

  it("inserts 0 events when re-attaching the same session without duplicating executions", async () => {
    const home = await makeHome();
    expect(
      await runImport(["codex", CODEX], { home, stdout: capture(), stderr: capture() }),
    ).toBe(0);
    expect(
      await runImport(["pi", TRACE_B, "--work", CODEX_WORK_ID], {
        home,
        stdout: capture(),
        stderr: capture(),
      }),
    ).toBe(0);

    const stdout = capture();
    const stderr = capture();
    const code = await runImport(["pi", TRACE_B, "--work", CODEX_WORK_ID], {
      home,
      stdout,
      stderr,
    });

    expect(code).toBe(0);
    expect(stdout.toString()).toContain("Imported pi session.");
    expect(stdout.toString()).toContain(CODEX_WORK_ID);
    expect(stdout.toString()).toMatch(/Events inserted\n0\n/);

    const store = initHarnieStore({ home });
    try {
      const loaded = loadWork(store, CODEX_WORK_ID);
      expect(loaded?.executions).toHaveLength(2);
      expect(loaded?.executions.map((execution) => execution.id)).toEqual(
        expect.arrayContaining([PI_EXECUTION_ID, CODEX_EXECUTION_ID]),
      );
    } finally {
      store.close();
    }
  });

  it("still creates work:pi work on natural import with one execution", async () => {
    const home = await makeHome();
    const stdout = capture();
    const stderr = capture();

    const code = await runImport(["pi", TRACE_B], { home, stdout, stderr });

    expect(code).toBe(0);
    expect(stdout.toString()).toContain("Imported pi session.");
    expect(stdout.toString()).toContain(PI_WORK_ID);

    const store = initHarnieStore({ home });
    try {
      const loaded = loadWork(store, PI_WORK_ID);
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(PI_WORK_ID);
      expect(loaded?.executions).toHaveLength(1);
      expect(loaded?.executions[0]?.id).toBe(PI_EXECUTION_ID);
    } finally {
      store.close();
    }
  });

  it("builds a handoff from pi work with an attached codex session", async () => {
    const home = await makeHome();
    expect(
      await runImport(["pi", TRACE_B], { home, stdout: capture(), stderr: capture() }),
    ).toBe(0);

    const stdout = capture();
    const code = await runImport(["codex", CODEX, "--work", PI_WORK_ID], {
      home,
      stdout,
      stderr: capture(),
    });

    expect(code).toBe(0);
    expect(stdout.toString()).toContain("Imported codex session.");
    expect(stdout.toString()).toContain(PI_WORK_ID);
    expect(stdout.toString()).toMatch(/Events inserted\n\d+\n/);

    const store = initHarnieStore({ home });
    try {
      const loaded = loadWork(store, PI_WORK_ID);
      expect(loaded?.executions).toHaveLength(2);
      expect(loaded?.executions.map((execution) => execution.id)).toEqual(
        expect.arrayContaining([PI_EXECUTION_ID, CODEX_EXECUTION_ID]),
      );
      const handoff = buildHandoffFromWork(loaded as Work);
      expect(handoff.workId).toBe(PI_WORK_ID);
      expect(handoff.operations.length).toBeGreaterThan(0);
      const operations = handoff.operations.join("\n");
      expect(operations).toContain("src/cli.ts");
      expect(operations).toMatch(/read|README\.md/);
    } finally {
      store.close();
    }
  });

  it("attaches through runCli end-to-end", async () => {
    const home = await makeHome();
    const imported = capture();
    expect(
      await runCli(["import", "pi", TRACE_B], { home, stdout: imported, stderr: capture() }),
    ).toBe(0);
    expect(imported.toString()).toContain(PI_WORK_ID);

    const stdout = capture();
    const stderr = capture();
    const code = await runCli(["import", "codex", CODEX, "--work", PI_WORK_ID], {
      home,
      stdout,
      stderr,
    });

    expect(code).toBe(0);
    expect(stdout.toString()).toContain("Imported codex session.");
    expect(stdout.toString()).toContain(PI_WORK_ID);
    expect(stdout.toString()).toMatch(/Events inserted\n\d+\n/);

    const store = initHarnieStore({ home });
    try {
      const loaded = loadWork(store, PI_WORK_ID);
      expect(loaded?.executions).toHaveLength(2);
      expect(loaded?.executions.map((execution) => execution.id)).toEqual(
        expect.arrayContaining([PI_EXECUTION_ID, CODEX_EXECUTION_ID]),
      );
      const rows = listWorks(store);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(PI_WORK_ID);
    } finally {
      store.close();
    }
  });
});
