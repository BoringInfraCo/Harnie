import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { runCheckpoint } from "../src/cli/checkpoint.js";
import { runHistory } from "../src/cli/history.js";
import { runImport } from "../src/cli/import.js";
import { runShow } from "../src/cli/show.js";
import { importCodexSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";
import { storeDatabase } from "../src/store/database.js";
import { listCheckpoints } from "../src/store/checkpoints.js";
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

describe("harnie checkpoint", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-cli-checkpoint-"));
    homes.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("creates a checkpoint with a frozen snapshot and latest execution", async () => {
    const home = await makeHome();
    expect(await runImport(["pi", TRACE_B], { home, stdout: capture(), stderr: capture() })).toBe(0);

    let frozenDecisions: unknown;
    let latestExecutionId = "";
    let eventCount = 0;
    const seedStore = initHarnieStore({ home });
    try {
      const loaded = loadWork(seedStore, PI_WORK_ID);
      expect(loaded).toBeDefined();
      frozenDecisions = loaded?.decisions ?? [];
      latestExecutionId = loaded?.executions[loaded.executions.length - 1]?.id ?? "";
      eventCount = loaded?.events.length ?? 0;
      expect(latestExecutionId).not.toBe("");
    } finally {
      seedStore.close();
    }

    const stdout = capture();
    const stderr = capture();
    const code = await runCheckpoint([PI_WORK_ID, "first", "checkpoint"], { home, stdout, stderr });
    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    const expectedId = `checkpoint:${PI_WORK_ID}:0001`;
    expect(stdout.toString()).toContain("Checkpoint");
    expect(stdout.toString()).toContain(expectedId);
    expect(stdout.toString()).toContain(PI_WORK_ID);
    expect(stdout.toString()).toContain("first checkpoint");

    const store = initHarnieStore({ home });
    try {
      const checkpoints = listCheckpoints(store, PI_WORK_ID);
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0]?.id).toBe(expectedId);
      expect(checkpoints[0]?.message).toBe("first checkpoint");
      expect(checkpoints[0]?.executionId).toBe(latestExecutionId);
      expect(checkpoints[0]?.eventCount).toBe(eventCount);
      expect(checkpoints[0]?.decisions).toEqual(frozenDecisions);

      const db = storeDatabase(store);
      const row = db
        .prepare("SELECT execution_id, decisions_json, event_count FROM checkpoints WHERE id = ?")
        .get(expectedId) as unknown as { execution_id: string | null; decisions_json: string; event_count: number };
      expect(row.execution_id).toBe(latestExecutionId);
      expect(JSON.parse(row.decisions_json)).toEqual(frozenDecisions);
      expect(Number(row.event_count)).toBe(eventCount);
    } finally {
      store.close();
    }
  });

  it("keeps the checkpoint row immutable while work grows via attach", async () => {
    const home = await makeHome();
    expect(await runImport(["pi", TRACE_B], { home, stdout: capture(), stderr: capture() })).toBe(0);
    expect(await runCheckpoint([PI_WORK_ID, "before", "attach"], { home, stdout: capture(), stderr: capture() })).toBe(
      0,
    );

    let beforeJson = "";
    let beforeCount = 0;
    const beforeStore = initHarnieStore({ home });
    try {
      const db = storeDatabase(beforeStore);
      const row = db
        .prepare(
          "SELECT decisions_json, event_count, message FROM checkpoints WHERE id = ?",
        )
        .get(`checkpoint:${PI_WORK_ID}:0001`) as unknown as {
        decisions_json: string;
        event_count: number;
        message: string;
      };
      beforeJson = row.decisions_json;
      beforeCount = Number(row.event_count);
      expect(row.message).toBe("before attach");
    } finally {
      beforeStore.close();
    }

    const attachStore = initHarnieStore({ home });
    try {
      await importCodexSessionFile(attachStore, CODEX, { workId: PI_WORK_ID });
    } finally {
      attachStore.close();
    }

    const checkStore = initHarnieStore({ home });
    try {
      const loaded = loadWork(checkStore, PI_WORK_ID);
      expect(loaded?.executions).toHaveLength(2);
      expect(loaded?.events.length).toBeGreaterThan(beforeCount);
      const db = storeDatabase(checkStore);
      const row = db
        .prepare(
          "SELECT decisions_json, event_count, message FROM checkpoints WHERE id = ?",
        )
        .get(`checkpoint:${PI_WORK_ID}:0001`) as unknown as {
        decisions_json: string;
        event_count: number;
        message: string;
      };
      expect(row.decisions_json).toBe(beforeJson);
      expect(Number(row.event_count)).toBe(beforeCount);
      expect(row.message).toBe("before attach");
    } finally {
      checkStore.close();
    }

    const shown = capture();
    expect(await runShow([PI_WORK_ID], { home, stdout: shown, stderr: capture() })).toBe(0);
    expect(shown.toString()).toContain("Checkpoints");
    expect(shown.toString()).toContain(`checkpoint:${PI_WORK_ID}:0001`);
    expect(shown.toString()).toContain(`(${beforeCount} events)`);
  });

  it("creates two ids for the same message and lists both in history ASC", async () => {
    const home = await makeHome();
    expect(await runImport(["pi", TRACE_B], { home, stdout: capture(), stderr: capture() })).toBe(0);
    expect(
      await runCheckpoint([PI_WORK_ID, "repeat"], { home, stdout: capture(), stderr: capture() }),
    ).toBe(0);
    expect(
      await runCheckpoint([PI_WORK_ID, "repeat"], { home, stdout: capture(), stderr: capture() }),
    ).toBe(0);

    const store = initHarnieStore({ home });
    try {
      const checkpoints = listCheckpoints(store, PI_WORK_ID);
      expect(checkpoints).toHaveLength(2);
      expect(checkpoints[0]?.id).toBe(`checkpoint:${PI_WORK_ID}:0001`);
      expect(checkpoints[1]?.id).toBe(`checkpoint:${PI_WORK_ID}:0002`);
      expect(checkpoints[0]?.message).toBe("repeat");
      expect(checkpoints[1]?.message).toBe("repeat");
    } finally {
      store.close();
    }

    const historyOut = capture();
    expect(await runHistory([PI_WORK_ID], { home, stdout: historyOut, stderr: capture() })).toBe(0);
    const text = historyOut.toString();
    expect(text).toContain("Checkpoints");
    expect(text).toContain(`checkpoint:${PI_WORK_ID}:0001`);
    expect(text).toContain(`checkpoint:${PI_WORK_ID}:0002`);
    expect(text.indexOf(`checkpoint:${PI_WORK_ID}:0001`)).toBeLessThan(
      text.indexOf(`checkpoint:${PI_WORK_ID}:0002`),
    );

    const cliOut = capture();
    expect(
      await runCli(["checkpoint", PI_WORK_ID, "repeat"], { home, stdout: cliOut, stderr: capture() }),
    ).toBe(0);
    expect(cliOut.toString()).toContain(`checkpoint:${PI_WORK_ID}:0003`);
  });

  it("exits 1 for unknown work and missing work id", async () => {
    const home = await makeHome();
    initHarnieStore({ home }).close();

    const stdout = capture();
    const stderr = capture();
    const code = await runCheckpoint(["work:pi:does-not-exist", "hello"], { home, stdout, stderr });
    expect(code).toBe(1);
    expect(stderr.toString()).toMatch(/Work not found/);
    expect(stdout.toString()).toBe("");

    const missingStderr = capture();
    expect(await runCheckpoint([], { home, stdout: capture(), stderr: missingStderr })).toBe(1);
    expect(missingStderr.toString()).toBe("Work id is required.\n");
  });

  it("stores an empty message and renders (no message) in checkpoint and show", async () => {
    const home = await makeHome();
    expect(await runImport(["pi", TRACE_B], { home, stdout: capture(), stderr: capture() })).toBe(0);

    const stdout = capture();
    const stderr = capture();
    expect(await runCheckpoint([PI_WORK_ID], { home, stdout, stderr })).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(stdout.toString()).toContain(`checkpoint:${PI_WORK_ID}:0001`);
    expect(stdout.toString()).toContain("(no message)");

    const store = initHarnieStore({ home });
    try {
      const checkpoints = listCheckpoints(store, PI_WORK_ID);
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0]?.message).toBe("");
    } finally {
      store.close();
    }

    const shown = capture();
    expect(await runShow([PI_WORK_ID], { home, stdout: shown, stderr: capture() })).toBe(0);
    expect(shown.toString()).toContain("(no message)");
    expect(shown.toString()).toContain(`checkpoint:${PI_WORK_ID}:0001`);
  });
});
