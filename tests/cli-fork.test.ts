import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { runFork } from "../src/cli/fork.js";
import { runHistory } from "../src/cli/history.js";
import { runImport } from "../src/cli/import.js";
import { runShow } from "../src/cli/show.js";
import { importCodexSessionFile } from "../src/engine/import.js";
import { listCheckpoints } from "../src/store/checkpoints.js";
import { databasePath, initHarnieStore, storeDatabase } from "../src/store/database.js";
import { loadWork, persistObservedWork } from "../src/store/persist.js";
import { buildHandoffFromWork } from "../src/work/handoff.js";

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

const childIdFromStdout = (stdout: string): string => {
  const match = stdout.match(/Fork\n(\S+)\n/);
  expect(match?.[1]).toBeDefined();
  return match?.[1] as string;
};

describe("harnie fork", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-cli-fork-"));
    homes.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("isolates child attach from the parent", async () => {
    const home = await makeHome();
    expect(await runImport(["pi", TRACE_B], { home, stdout: capture(), stderr: capture() })).toBe(0);

    let handoffBefore = "";
    const seedStore = initHarnieStore({ home });
    try {
      const loaded = loadWork(seedStore, PI_WORK_ID);
      expect(loaded?.executions).toHaveLength(1);
      handoffBefore = JSON.stringify(buildHandoffFromWork(loaded as NonNullable<typeof loaded>));
    } finally {
      seedStore.close();
    }

    const stdout = capture();
    const stderr = capture();
    expect(await runFork([PI_WORK_ID, "explore", "codex"], { home, stdout, stderr })).toBe(0);
    expect(stderr.toString()).toBe("");
    const childId = childIdFromStdout(stdout.toString());
    expect(childId).toMatch(/^work:fork:[a-z2-7]{8}$/);
    expect(stdout.toString()).toContain(`${PI_WORK_ID} @ checkpoint:${PI_WORK_ID}:0001`);
    expect(stdout.toString()).toContain('"explore codex"');

    const attachStore = initHarnieStore({ home });
    try {
      const result = await importCodexSessionFile(attachStore, CODEX, { workId: childId });
      expect(result.eventsInserted).toBeGreaterThan(0);
    } finally {
      attachStore.close();
    }

    const checkStore = initHarnieStore({ home });
    try {
      const parent = loadWork(checkStore, PI_WORK_ID);
      const child = loadWork(checkStore, childId);
      expect(parent?.executions).toHaveLength(1);
      expect(child?.executions).toHaveLength(2);
      expect(child?.executions.map((execution) => execution.id)).toEqual(
        expect.arrayContaining([PI_EXECUTION_ID, CODEX_EXECUTION_ID]),
      );
      expect(child?.forkedFrom?.workId).toBe(PI_WORK_ID);
      expect(child?.forkedFrom?.checkpointId).toBe(`checkpoint:${PI_WORK_ID}:0001`);
      expect(child?.forkedFrom?.message).toBe("explore codex");
      expect(JSON.stringify(buildHandoffFromWork(parent as NonNullable<typeof parent>))).toBe(handoffBefore);
    } finally {
      checkStore.close();
    }

    const shown = capture();
    expect(await runShow([childId], { home, stdout: shown, stderr: capture() })).toBe(0);
    expect(shown.toString()).toContain("Forked from");
    expect(shown.toString()).toContain(`${PI_WORK_ID} @ checkpoint:${PI_WORK_ID}:0001`);

    const historyOut = capture();
    expect(await runHistory([childId], { home, stdout: historyOut, stderr: capture() })).toBe(0);
    expect(historyOut.toString()).toContain("Forked from");

    const parentShown = capture();
    expect(await runShow([PI_WORK_ID], { home, stdout: parentShown, stderr: capture() })).toBe(0);
    expect(parentShown.toString()).not.toContain("Forked from");
  });

  it("pins the fork to an explicit checkpoint and auto-creates pre-fork", async () => {
    const home = await makeHome();
    expect(await runImport(["pi", TRACE_B], { home, stdout: capture(), stderr: capture() })).toBe(0);
    expect(await runCli(["checkpoint", PI_WORK_ID, "before", "attach"], { home, stdout: capture(), stderr: capture() })).toBe(
      0,
    );

    let checkpointEventCount = 0;
    const seedStore = initHarnieStore({ home });
    try {
      const checkpoints = listCheckpoints(seedStore, PI_WORK_ID);
      expect(checkpoints).toHaveLength(1);
      checkpointEventCount = checkpoints[0]?.eventCount ?? 0;
      expect(checkpointEventCount).toBeGreaterThan(0);
      await importCodexSessionFile(seedStore, CODEX, { workId: PI_WORK_ID });
      expect(loadWork(seedStore, PI_WORK_ID)?.executions).toHaveLength(2);
    } finally {
      seedStore.close();
    }

    const pinnedOut = capture();
    expect(
      await runFork(["--checkpoint", `checkpoint:${PI_WORK_ID}:0001`, PI_WORK_ID, "pinned"], {
        home,
        stdout: pinnedOut,
        stderr: capture(),
      }),
    ).toBe(0);
    const pinnedId = childIdFromStdout(pinnedOut.toString());

    const latestOut = capture();
    expect(await runCli(["checkpoint", PI_WORK_ID, "after", "attach"], { home, stdout: capture(), stderr: capture() })).toBe(
      0,
    );
    expect(await runFork([PI_WORK_ID, "latest"], { home, stdout: latestOut, stderr: capture() })).toBe(0);
    const latestId = childIdFromStdout(latestOut.toString());
    expect(latestId).not.toBe(pinnedId);

    const checkStore = initHarnieStore({ home });
    try {
      const pinned = loadWork(checkStore, pinnedId);
      expect(pinned?.executions).toHaveLength(1);
      expect(pinned?.executions[0]?.id).toBe(PI_EXECUTION_ID);
      expect(pinned?.events).toHaveLength(checkpointEventCount);
      expect(pinned?.forkedFrom?.checkpointId).toBe(`checkpoint:${PI_WORK_ID}:0001`);
      const latest = loadWork(checkStore, latestId);
      expect(latest?.executions).toHaveLength(2);
      expect(latest?.forkedFrom?.checkpointId).toBe(`checkpoint:${PI_WORK_ID}:0002`);
    } finally {
      checkStore.close();
    }

    const freshHome = await makeHome();
    expect(await runImport(["pi", TRACE_B], { home: freshHome, stdout: capture(), stderr: capture() })).toBe(0);
    const freshOut = capture();
    expect(await runCli(["fork", PI_WORK_ID, "fresh"], { home: freshHome, stdout: freshOut, stderr: capture() })).toBe(0);
    const freshId = childIdFromStdout(freshOut.toString());
    const freshStore = initHarnieStore({ home: freshHome });
    try {
      const checkpoints = listCheckpoints(freshStore, PI_WORK_ID);
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0]?.message).toBe("pre-fork");
      const fresh = loadWork(freshStore, freshId);
      expect(fresh?.forkedFrom?.checkpointId).toBe(checkpoints[0]?.id);
      const db = storeDatabase(freshStore);
      const row = db
        .prepare("SELECT forked_from_work_id, forked_from_checkpoint_id FROM works WHERE id = ?")
        .get(freshId) as unknown as { forked_from_work_id: string; forked_from_checkpoint_id: string };
      expect(row.forked_from_work_id).toBe(PI_WORK_ID);
      expect(row.forked_from_checkpoint_id).toBe(checkpoints[0]?.id);
    } finally {
      freshStore.close();
    }
  });

  it("keeps per-work idempotency after forking", async () => {
    const home = await makeHome();
    expect(await runImport(["pi", TRACE_B], { home, stdout: capture(), stderr: capture() })).toBe(0);
    const forkOut = capture();
    expect(await runFork([PI_WORK_ID, "idem"], { home, stdout: forkOut, stderr: capture() })).toBe(0);
    const childId = childIdFromStdout(forkOut.toString());

    const store = initHarnieStore({ home });
    try {
      const intoParent = await importCodexSessionFile(store, CODEX, { workId: PI_WORK_ID });
      const intoChild = await importCodexSessionFile(store, CODEX, { workId: childId });
      expect(intoParent.eventsInserted).toBeGreaterThan(0);
      expect(intoChild.eventsInserted).toBe(intoParent.eventsInserted);
      const parent = loadWork(store, PI_WORK_ID);
      const child = loadWork(store, childId);
      expect(parent?.executions).toHaveLength(2);
      expect(child?.executions).toHaveLength(2);
      expect(child?.events.length).toBe(parent?.events.length);
      const again = await importCodexSessionFile(store, CODEX, { workId: childId });
      expect(again.eventsInserted).toBe(0);
      expect(loadWork(store, childId)?.executions).toHaveLength(2);
    } finally {
      store.close();
    }
  });

  it("diverges the child while the parent handoff stays byte-identical", async () => {
    const home = await makeHome();
    expect(await runImport(["pi", TRACE_B], { home, stdout: capture(), stderr: capture() })).toBe(0);

    let handoffBefore = "";
    const seedStore = initHarnieStore({ home });
    try {
      handoffBefore = JSON.stringify(buildHandoffFromWork(loadWork(seedStore, PI_WORK_ID) as NonNullable<ReturnType<typeof loadWork>>));
    } finally {
      seedStore.close();
    }

    const forkOut = capture();
    expect(await runFork([PI_WORK_ID, "diverge"], { home, stdout: forkOut, stderr: capture() })).toBe(0);
    const childId = childIdFromStdout(forkOut.toString());

    const attachStore = initHarnieStore({ home });
    try {
      await importCodexSessionFile(attachStore, CODEX, { workId: childId });
    } finally {
      attachStore.close();
    }

    const checkStore = initHarnieStore({ home });
    try {
      const parent = loadWork(checkStore, PI_WORK_ID);
      const child = loadWork(checkStore, childId);
      expect(JSON.stringify(buildHandoffFromWork(parent as NonNullable<typeof parent>))).toBe(handoffBefore);
      const codexEventIds = new Set(
        (child?.events ?? []).filter((event) => event.executionId === CODEX_EXECUTION_ID).map((event) => event.id),
      );
      expect(codexEventIds.size).toBeGreaterThan(0);
      expect(
        (child?.decisions ?? []).some((decision) => decision.evidence.some((id) => codexEventIds.has(id))),
      ).toBe(true);
      const parentHandoff = JSON.stringify(buildHandoffFromWork(parent as NonNullable<typeof parent>));
      const childHandoff = JSON.stringify(buildHandoffFromWork(child as NonNullable<typeof child>));
      expect(childHandoff).not.toBe(parentHandoff);
    } finally {
      checkStore.close();
    }
  });

  it("fails for unknown work, foreign checkpoint, empty work, and missing id", async () => {
    const home = await makeHome();
    initHarnieStore({ home }).close();

    const unknownStderr = capture();
    expect(await runFork(["work:pi:does-not-exist", "nope"], { home, stdout: capture(), stderr: unknownStderr })).toBe(1);
    expect(unknownStderr.toString()).toMatch(/Work not found: work:pi:does-not-exist/);

    expect(await runImport(["pi", TRACE_B], { home, stdout: capture(), stderr: capture() })).toBe(0);
    expect(await runImport(["codex", CODEX], { home, stdout: capture(), stderr: capture() })).toBe(0);
    expect(
      await runCli(["checkpoint", PI_WORK_ID, "parent-point"], { home, stdout: capture(), stderr: capture() }),
    ).toBe(0);

    const foreignStderr = capture();
    expect(
      await runFork(["--checkpoint", `checkpoint:${PI_WORK_ID}:0001`, CODEX_WORK_ID, "cross"], {
        home,
        stdout: capture(),
        stderr: foreignStderr,
      }),
    ).toBe(1);
    expect(foreignStderr.toString()).toMatch(/Checkpoint not found: checkpoint:work:pi:harnie-tb-da82c4f8:0001/);

    const emptyStore = initHarnieStore({ home });
    try {
      persistObservedWork(emptyStore, {
        id: "work:empty:1",
        executions: [
          {
            id: "execution:empty:1",
            workId: "work:empty:1",
            harness: "pi",
            sourceSession: { harness: "pi", sourceId: "s" },
          },
        ],
        events: [],
        diagnostics: [],
      });
    } finally {
      emptyStore.close();
    }
    const emptyStderr = capture();
    expect(await runFork(["work:empty:1", "nothing"], { home, stdout: capture(), stderr: emptyStderr })).toBe(1);
    expect(emptyStderr.toString()).toMatch(/Work has no events to fork/);

    const missingStderr = capture();
    expect(await runFork([], { home, stdout: capture(), stderr: missingStderr })).toBe(1);
    expect(missingStderr.toString()).toBe("Work id is required.\n");
  });

  it.each([false, true])("migrates a pre-existing old-shape database (checkpoints: %s)", async (withCheckpoints) => {
    const home = await makeHome();
    const raw = new DatabaseSync(databasePath(home));
    try {
      raw.exec(`CREATE TABLE works (
        id TEXT PRIMARY KEY,
        workspace_path TEXT,
        created_at TEXT,
        updated_at TEXT,
        diagnostics TEXT NOT NULL DEFAULT '[]'
      )`);
      raw.exec(`CREATE TABLE executions (
        id TEXT PRIMARY KEY,
        work_id TEXT NOT NULL REFERENCES works(id),
        harness TEXT NOT NULL,
        model TEXT,
        provider TEXT,
        started_at TEXT
      )`);
      raw.exec(`CREATE TABLE source_sessions (
        execution_id TEXT PRIMARY KEY REFERENCES executions(id),
        harness TEXT NOT NULL,
        source_id TEXT NOT NULL,
        source_format TEXT,
        source_location TEXT,
        UNIQUE (harness, source_id)
      )`);
      raw.exec(`CREATE TABLE events (
        id TEXT PRIMARY KEY,
        work_id TEXT NOT NULL REFERENCES works(id),
        execution_id TEXT NOT NULL REFERENCES executions(id),
        kind TEXT NOT NULL,
        timestamp TEXT,
        payload TEXT NOT NULL,
        provenance TEXT NOT NULL,
        diagnostics TEXT NOT NULL,
        harness TEXT NOT NULL,
        source_session_id TEXT NOT NULL,
        source_event_id TEXT NOT NULL,
        provenance_line INTEGER,
        ordinal INTEGER NOT NULL,
        UNIQUE (harness, source_session_id, source_event_id)
      )`);
      raw.prepare("INSERT INTO works (id, workspace_path, created_at, updated_at, diagnostics) VALUES (?, ?, ?, ?, ?)").run(
        "work:old:1",
        "/workspace/old",
        "2026-01-01T00:00:00.000Z",
        "2026-01-02T00:00:00.000Z",
        "[]",
      );
      raw.prepare("INSERT INTO executions (id, work_id, harness) VALUES (?, ?, ?)").run("execution:old:1", "work:old:1", "pi");
      raw.prepare("INSERT INTO source_sessions (execution_id, harness, source_id) VALUES (?, ?, ?)").run(
        "execution:old:1",
        "pi",
        "s-old-1",
      );
      raw.prepare(`INSERT INTO events (id, work_id, execution_id, kind, payload, provenance, diagnostics,
        harness, source_session_id, source_event_id, provenance_line, ordinal)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        "event:old:1",
        "work:old:1",
        "execution:old:1",
        "message",
        "{}",
        JSON.stringify({ harness: "pi", line: 1, observation: "observed" }),
        "[]",
        "pi",
        "s-old-1",
        "event:old:1",
        1,
        0,
      );
      if (withCheckpoints) {
        raw.exec(`CREATE TABLE checkpoints (
          id TEXT PRIMARY KEY,
          work_id TEXT NOT NULL REFERENCES works(id),
          execution_id TEXT REFERENCES executions(id),
          message TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          event_ordinal_watermark INTEGER NOT NULL,
          event_count INTEGER NOT NULL,
          goal_json TEXT,
          decisions_json TEXT NOT NULL DEFAULT '[]',
          findings_json TEXT NOT NULL DEFAULT '[]',
          next_steps_json TEXT NOT NULL DEFAULT '[]',
          operations_json TEXT NOT NULL DEFAULT '[]'
        )`);
        for (const [id, date] of [["checkpoint:old:1", "2026-01-03"], ["checkpoint:old:2", "2026-01-02"]]) {
          raw.prepare(`INSERT INTO checkpoints
            (id, work_id, execution_id, message, created_at, event_ordinal_watermark, event_count,
             goal_json, decisions_json, findings_json, next_steps_json, operations_json)
            VALUES (?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?, ?)`).run(
              id!, "work:old:1", "execution:old:1", "frozen history", date!,
              JSON.stringify({ statement: "Original goal", evidence: ["event:old:1"] }),
              '[{"summary":"Original decision"}]', '[{"statement":"Original finding"}]',
              '[{"description":"Original next step"}]', '[{"status":"pending"}]',
            );
        }
      }
    } finally {
      raw.close();
    }

    const original = new DatabaseSync(databasePath(home));
    const snapshots = withCheckpoints ? original.prepare("SELECT * FROM checkpoints ORDER BY rowid").all() : [];
    original.close();
    const store = initHarnieStore({ home });
    try {
      const loaded = loadWork(store, "work:old:1");
      expect(loaded?.executions).toHaveLength(1);
      expect(loaded?.executions[0]?.sourceSession.sourceId).toBe("s-old-1");
      expect(loaded?.events).toHaveLength(1);
      const db = storeDatabase(store);
      const executionsSql = (
        db.prepare("SELECT sql FROM sqlite_master WHERE name = 'executions'").get() as unknown as { sql: string }
      ).sql;
      expect(executionsSql).toContain("PRIMARY KEY (work_id");
      const sessionsSql = (
        db.prepare("SELECT sql FROM sqlite_master WHERE name = 'source_sessions'").get() as unknown as { sql: string }
      ).sql;
      expect(sessionsSql).toContain("PRIMARY KEY (work_id");
      const eventsSql = (
        db.prepare("SELECT sql FROM sqlite_master WHERE name = 'events'").get() as unknown as { sql: string }
      ).sql;
      expect(eventsSql).toContain("PRIMARY KEY (work_id");
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(db.prepare("PRAGMA foreign_keys").get()?.foreign_keys).toBe(1);
      if (withCheckpoints) {
        expect(db.prepare("SELECT * FROM checkpoints ORDER BY rowid").all()).toEqual(snapshots);
        expect(listCheckpoints(store, "work:old:1").map((checkpoint) => checkpoint.id))
          .toEqual(["checkpoint:old:1", "checkpoint:old:2"]);
        expect(db.prepare("PRAGMA index_info(idx_checkpoints_work_seq)").all().map((row) => row.name))
          .toEqual(["work_id"]);
      }
    } finally {
      store.close();
    }
    const reopened = initHarnieStore({ home });
    try {
      expect(loadWork(reopened, "work:old:1")?.events).toHaveLength(1);
      if (withCheckpoints) {
        expect(storeDatabase(reopened).prepare("SELECT * FROM checkpoints ORDER BY rowid").all()).toEqual(snapshots);
      }
    } finally {
      reopened.close();
    }
  });
});
