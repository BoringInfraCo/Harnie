import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHandoff } from "../src/cli/handoff.js";
import { importOpenCodeSessionFile, importPiSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";

const OPENCODE_FIXTURE = "tests/fixtures/opencode/sprint-012-handoff.json";
const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";
const hasOpenCodeFixture = existsSync(OPENCODE_FIXTURE);
const REAL_HARNIE_HOME = join(homedir(), ".harnie");
const REAL_PI_HOME = join(homedir(), ".pi");
const REAL_PI_SESSIONS = join(REAL_PI_HOME, "agent", "sessions");

if (!hasOpenCodeFixture) {
  console.warn(
    "Note: tests/fixtures/opencode/sprint-012-handoff.json is not present; OpenCode-to-Pi handoff tests are skipped.",
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

const jsonlFiles = (root: string): string[] => {
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".jsonl")) found.push(path);
    }
  };
  walk(root);
  return found;
};

const snapshotPiSessions = () => {
  const existed = existsSync(REAL_PI_HOME);
  const sessionsExisted = existsSync(REAL_PI_SESSIONS);
  const files = new Map<string, { mtimeMs: number; size: number }>();
  if (sessionsExisted) {
    for (const path of jsonlFiles(REAL_PI_SESSIONS)) {
      const st = statSync(path);
      files.set(path, { mtimeMs: st.mtimeMs, size: st.size });
    }
  }
  return {
    existed,
    sessionsExisted,
    files,
  };
};

const expectPiSessionsUnchanged = (before: ReturnType<typeof snapshotPiSessions>): void => {
  if (!before.existed) {
    expect(existsSync(REAL_PI_HOME)).toBe(false);
    return;
  }
  if (!before.sessionsExisted) {
    expect(existsSync(REAL_PI_SESSIONS)).toBe(false);
  } else {
    const afterFiles = jsonlFiles(REAL_PI_SESSIONS);
    expect(afterFiles.sort()).toEqual([...before.files.keys()].sort());
    for (const path of afterFiles) {
      const st = statSync(path);
      const prior = before.files.get(path);
      expect(prior).toBeDefined();
      expect(st.mtimeMs).toBe(prior?.mtimeMs);
      expect(st.size).toBe(prior?.size);
    }
  }
};

const piHandoffFiles = (home: string): string[] => {
  const directory = join(home, "handoffs");
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith(".pi.md"));
};

describe("harnie handoff --to pi", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-cli-handoff-pi-"));
    homes.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it.skipIf(!hasOpenCodeFixture)(
    "prints a Pi handoff for OpenCode-imported work and writes .pi.md",
    async () => {
      const home = await makeHome();
      const store = initHarnieStore({ home });
      let workId: string;
      try {
        workId = (await importOpenCodeSessionFile(store, OPENCODE_FIXTURE)).workId;
      } finally {
        store.close();
      }

      const stdout = capture();
      const stderr = capture();
      const code = await runHandoff([workId, "--to", "pi"], { home, stdout, stderr });
      const output = stdout.toString();
      const files = piHandoffFiles(home);

      expect(code).toBe(0);
      expect(stderr.toString()).toBe("");
      expect(output).toMatch(/for Pi/i);
      expect(output).toMatch(/continue/i);
      expect(files.length).toBe(1);
      expect(readFileSync(join(home, "handoffs", files[0] ?? ""), "utf8")).toBe(output);
      expect(jsonlFiles(home)).toEqual([]);
    },
  );

  it("keeps Trace B unresolved without claiming investigation complete", async () => {
    const home = await makeHome();
    const store = initHarnieStore({ home });
    let workId: string;
    try {
      workId = (await importPiSessionFile(store, TRACE_B)).workId;
    } finally {
      store.close();
    }

    const stdout = capture();
    const stderr = capture();
    const code = await runHandoff([workId, "--to", "pi"], { home, stdout, stderr });
    const output = stdout.toString();

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(output).toMatch(/unresolved|pending/i);
    expect(output).not.toMatch(/complete[- ]investigation|investigation (is |was )?complete/i);
    expect(piHandoffFiles(home).length).toBe(1);
    expect(jsonlFiles(home)).toEqual([]);
  });

  it("exits 1 for an unsupported --to target", async () => {
    const stderr = capture();

    const code = await runHandoff(["work:pi:abc", "--to", "foobar"], { stdout: capture(), stderr });

    expect(code).toBe(1);
    expect(stderr.toString()).toMatch(/not implemented/i);
  });

  it("never writes ~/.harnie or ~/.pi sessions", async () => {
    const beforeHome = snapshotRealHome();
    const beforePi = snapshotPiSessions();
    const home = await makeHome();
    const store = initHarnieStore({ home });
    let workId: string;
    try {
      workId = (await importPiSessionFile(store, TRACE_B)).workId;
    } finally {
      store.close();
    }

    expect(await runHandoff([workId, "--to", "pi"], { home, stdout: capture(), stderr: capture() })).toBe(0);
    expect(await runHandoff(["work:pi:abc", "--to", "foobar"], { stdout: capture(), stderr: capture() })).toBe(1);

    if (hasOpenCodeFixture) {
      const opencodeStore = initHarnieStore({ home });
      let opencodeWorkId: string;
      try {
        opencodeWorkId = (await importOpenCodeSessionFile(opencodeStore, OPENCODE_FIXTURE)).workId;
      } finally {
        opencodeStore.close();
      }
      expect(
        await runHandoff([opencodeWorkId, "--to", "pi"], { home, stdout: capture(), stderr: capture() }),
      ).toBe(0);
    }

    expect(existsSync(join(home, "harnie.db"))).toBe(true);
    expect(jsonlFiles(home)).toEqual([]);
    expectRealHomeUnchanged(beforeHome);
    expectPiSessionsUnchanged(beforePi);
  });
});
