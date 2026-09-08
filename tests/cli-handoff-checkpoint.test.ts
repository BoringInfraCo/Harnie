import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { runHandoff } from "../src/cli/handoff.js";
import { runImport } from "../src/cli/import.js";
import { importCodexSessionFile } from "../src/engine/import.js";
import { listCheckpoints } from "../src/store/checkpoints.js";
import { initHarnieStore, storeDatabase } from "../src/store/database.js";
import { createFork, loadWorkAtCheckpoint } from "../src/store/fork.js";
import { loadWork } from "../src/store/persist.js";

const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";
const CODEX = "tests/fixtures/codex/unfinished-read.jsonl";
const PI_WORK_ID = "work:pi:harnie-tb-da82c4f8";
const CODEX_WORK_ID = "work:codex:01codexunfinished000000000001";
const CODEX_SOURCE_ID = "01codexunfinished000000000001";

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

const createCheckpoint = async (home: string, message: string): Promise<string> => {
  const stdout = capture();
  expect(await runCli(["checkpoint", PI_WORK_ID, message], { home, stdout, stderr: capture() })).toBe(0);
  const id = stdout.toString().match(/checkpoint:[^\n]+/)?.[0];
  expect(id).toBeDefined();
  return id as string;
};

const handoff = async (home: string, argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> => {
  const stdout = capture();
  const stderr = capture();
  const code = await runHandoff(argv, { home, stdout, stderr });
  return { code, stdout: stdout.toString(), stderr: stderr.toString() };
};

const snapshotStore = (home: string) => {
  const store = initHarnieStore({ home });
  try {
    const db = storeDatabase(store);
    const count = (table: "works" | "executions" | "events" | "checkpoints"): number =>
      Number((db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as unknown as { count: number }).count);
    const forkCount = Number(
      (
        db.prepare("SELECT COUNT(*) AS count FROM works WHERE forked_from_work_id IS NOT NULL").get() as unknown as {
          count: number;
        }
      ).count,
    );
    return {
      work: loadWork(store, PI_WORK_ID),
      checkpoints: listCheckpoints(store, PI_WORK_ID),
      counts: {
        works: count("works"),
        executions: count("executions"),
        events: count("events"),
        checkpoints: count("checkpoints"),
        forks: forkCount,
      },
    };
  } finally {
    store.close();
  }
};

describe("harnie handoff --checkpoint", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-cli-handoff-checkpoint-"));
    homes.push(home);
    return home;
  };

  const importTraceB = async (home: string): Promise<void> => {
    expect(await runImport(["pi", TRACE_B], { home, stdout: capture(), stderr: capture() })).toBe(0);
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("keeps a stale checkpoint byte-identical after attach while the default handoff stays live", async () => {
    const home = await makeHome();
    await importTraceB(home);
    const checkpointId = await createCheckpoint(home, "before attach");

    const before = await handoff(home, [PI_WORK_ID, "--to", "opencode", "--checkpoint", checkpointId]);
    expect(before.code).toBe(0);
    expect(before.stderr).toBe("");
    expect(before.stdout).toContain("47da672");
    expect(before.stdout).toContain(".git/config");
    expect(before.stdout).toMatch(/refactoring plan|propose a/i);
    expect(before.stdout).not.toContain(CODEX_SOURCE_ID);
    expect(before.stdout).not.toContain("src/cli.ts");
    expect(before.stdout).not.toContain("src/quiet.ts");

    const store = initHarnieStore({ home });
    try {
      const attached = await importCodexSessionFile(store, CODEX, { workId: PI_WORK_ID });
      expect(attached.eventsInserted).toBeGreaterThan(0);
    } finally {
      store.close();
    }

    const stale = await handoff(home, ["--checkpoint", checkpointId, PI_WORK_ID, "--to", "opencode"]);
    expect(stale.code).toBe(0);
    expect(stale.stderr).toBe("");
    expect(stale.stdout).toBe(before.stdout);
    expect(stale.stdout).not.toContain(CODEX_SOURCE_ID);
    expect(stale.stdout).not.toContain("src/cli.ts");
    expect(stale.stdout).not.toContain("src/quiet.ts");

    const live = await handoff(home, [PI_WORK_ID, "--to", "opencode"]);
    expect(live.code).toBe(0);
    expect(live.stderr).toBe("");
    expect(live.stdout).not.toBe(stale.stdout);
    expect(live.stdout).toContain(CODEX_SOURCE_ID);
    expect(live.stdout).toContain("src/cli.ts");
    expect(live.stdout).toContain("src/quiet.ts");
  });

  it("makes the latest checkpoint equal the live handoff when no events follow its watermark", async () => {
    const home = await makeHome();
    await importTraceB(home);

    const store = initHarnieStore({ home });
    try {
      expect((await importCodexSessionFile(store, CODEX, { workId: PI_WORK_ID })).eventsInserted).toBeGreaterThan(0);
    } finally {
      store.close();
    }
    const checkpointId = await createCheckpoint(home, "after attach");

    const live = await handoff(home, [PI_WORK_ID, "--to", "opencode"]);
    const latest = await handoff(home, [PI_WORK_ID, "--checkpoint", checkpointId, "--to", "opencode"]);
    expect(live.code).toBe(0);
    expect(latest.code).toBe(0);
    expect(live.stderr).toBe("");
    expect(latest.stderr).toBe("");
    expect(latest.stdout).toBe(live.stdout);
    expect(latest.stdout).toContain(CODEX_SOURCE_ID);
    expect(latest.stdout).toContain("src/quiet.ts");
  });

  it("uses the same event and execution watermark projection as an explicit fork", async () => {
    const home = await makeHome();
    await importTraceB(home);
    const checkpointId = await createCheckpoint(home, "shared watermark");

    const store = initHarnieStore({ home });
    try {
      expect((await importCodexSessionFile(store, CODEX, { workId: PI_WORK_ID })).eventsInserted).toBeGreaterThan(0);
      const projected = loadWorkAtCheckpoint(store, PI_WORK_ID, checkpointId);
      const fork = createFork(store, PI_WORK_ID, "same watermark", checkpointId);
      const child = loadWork(store, fork.workId);

      expect(child).toBeDefined();
      expect(projected.id).toBe(PI_WORK_ID);
      expect(child?.id).toBe(fork.workId);
      expect(child?.id).not.toBe(projected.id);
      expect(projected.events.map((event) => event.id)).toEqual(child?.events.map((event) => event.id));
      expect(projected.executions.map((execution) => execution.id)).toEqual(
        child?.executions.map((execution) => execution.id),
      );
    } finally {
      store.close();
    }
  });

  it("keeps live and checkpoint-qualified handoff artifacts without overwriting either output", async () => {
    const home = await makeHome();
    await importTraceB(home);
    const checkpointId = await createCheckpoint(home, "artifact watermark");

    const store = initHarnieStore({ home });
    try {
      expect((await importCodexSessionFile(store, CODEX, { workId: PI_WORK_ID })).eventsInserted).toBeGreaterThan(0);
    } finally {
      store.close();
    }

    const live = await handoff(home, [PI_WORK_ID, "--to", "opencode"]);
    expect(live.code).toBe(0);
    const directory = join(home, "handoffs");
    const safeWorkId = PI_WORK_ID.replace(/[^A-Za-z0-9._-]+/g, "_");
    const safeCheckpointId = checkpointId.replace(/[^A-Za-z0-9._-]+/g, "_");
    const livePath = join(directory, `${safeWorkId}.md`);
    const checkpointPath = join(directory, `${safeWorkId}.${safeCheckpointId}.md`);
    expect(readFileSync(livePath, "utf8")).toBe(live.stdout);

    const checkpoint = await handoff(home, [PI_WORK_ID, "--checkpoint", checkpointId, "--to", "opencode"]);
    expect(checkpoint.code).toBe(0);
    expect(checkpoint.stderr).toBe("");
    expect(checkpoint.stdout).not.toBe(live.stdout);
    expect(readdirSync(directory).sort()).toEqual(
      [`${safeWorkId}.md`, `${safeWorkId}.${safeCheckpointId}.md`].sort(),
    );
    expect(readFileSync(checkpointPath, "utf8")).toBe(checkpoint.stdout);
    expect(readFileSync(livePath, "utf8")).toBe(live.stdout);
  });

  it("projects a checkpoint without creating a fork, checkpoint, or database mutation", async () => {
    const home = await makeHome();
    await importTraceB(home);
    const checkpointId = await createCheckpoint(home, "read only");
    const before = snapshotStore(home);

    const result = await handoff(home, [PI_WORK_ID, "--to", "opencode", "--checkpoint", checkpointId]);
    expect(result.code).toBe(0);
    expect(result.stderr).toBe("");

    const after = snapshotStore(home);
    expect(after).toEqual(before);
    expect(after.counts.forks).toBe(0);
    expect(after.counts.checkpoints).toBe(1);
  });

  it("rejects unknown and foreign checkpoints without writing a handoff", async () => {
    const home = await makeHome();
    await importTraceB(home);
    const checkpointId = await createCheckpoint(home, "belongs to pi");
    expect(await runImport(["codex", CODEX], { home, stdout: capture(), stderr: capture() })).toBe(0);

    const unknownId = `checkpoint:${PI_WORK_ID}:9999`;
    const unknown = await handoff(home, [PI_WORK_ID, "--to", "opencode", "--checkpoint", unknownId]);
    expect(unknown.code).toBe(1);
    expect(unknown.stdout).toBe("");
    expect(unknown.stderr).toBe(`Checkpoint not found: ${unknownId}\n`);

    const foreign = await handoff(home, [CODEX_WORK_ID, "--checkpoint", checkpointId, "--to", "opencode"]);
    expect(foreign.code).toBe(1);
    expect(foreign.stdout).toBe("");
    expect(foreign.stderr).toBe(`Checkpoint not found: ${checkpointId}\n`);
    expect(existsSync(join(home, "handoffs"))).toBe(false);
  });

  it.each([
    ["missing value", [PI_WORK_ID, "--to", "opencode", "--checkpoint"]],
    ["next flag as value", [PI_WORK_ID, "--checkpoint", "--to", "opencode"]],
    ["empty value", [PI_WORK_ID, "--checkpoint", "", "--to", "opencode"]],
  ])("rejects a malformed --checkpoint flag: %s", async (_label, argv) => {
    const home = await makeHome();
    await importTraceB(home);

    const result = await handoff(home, argv);
    expect(result.code).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toMatch(/usage: harnie handoff/i);
    expect(existsSync(join(home, "handoffs"))).toBe(false);
  });
});
