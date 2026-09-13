import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runImport } from "../src/cli/import.js";
import { runSessions } from "../src/cli/sessions.js";

const PI_FIXTURE = "tests/fixtures/pi/trace-b-unfinished.jsonl";
const CODEX_FIXTURE = "tests/fixtures/codex/unfinished-read.jsonl";
const GROK_CHAT_FIXTURE = "tests/fixtures/grok/unfinished-demo/chat_history.jsonl";

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

describe("harnie sessions discovery", () => {
  const temps: string[] = [];
  const savedEnv = new Map<string, string | undefined>();

  const makeTemp = async (prefix: string): Promise<string> => {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    temps.push(dir);
    return dir;
  };

  const setDiscoveryHome = (fakeHome: string): void => {
    if (!savedEnv.has("HARNIE_DISCOVERY_HOME")) {
      savedEnv.set("HARNIE_DISCOVERY_HOME", process.env.HARNIE_DISCOVERY_HOME);
    }
    process.env.HARNIE_DISCOVERY_HOME = fakeHome;
  };

  beforeEach(() => {
    savedEnv.clear();
  });

  afterEach(async () => {
    if (savedEnv.has("HARNIE_DISCOVERY_HOME")) {
      const prior = savedEnv.get("HARNIE_DISCOVERY_HOME");
      if (prior === undefined) delete process.env.HARNIE_DISCOVERY_HOME;
      else process.env.HARNIE_DISCOVERY_HOME = prior;
    }
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  const seedPiSession = async (fakeHome: string, fileName: string): Promise<string> => {
    const dir = join(fakeHome, ".pi", "agent", "sessions", "--workspace-proj--");
    await mkdir(dir, { recursive: true });
    const path = join(dir, fileName);
    await copyFile(PI_FIXTURE, path);
    return path;
  };

  const seedCodexSession = async (fakeHome: string, fileName: string): Promise<string> => {
    const dir = join(fakeHome, ".codex", "sessions", "2026", "09", "07");
    await mkdir(dir, { recursive: true });
    const path = join(dir, fileName);
    await copyFile(CODEX_FIXTURE, path);
    return path;
  };

  const seedGrokSession = async (
    fakeHome: string,
    bucket: string,
    sessionId: string,
  ): Promise<string> => {
    const dir = join(fakeHome, ".grok", "sessions", bucket, sessionId);
    await mkdir(dir, { recursive: true });
    await copyFile(GROK_CHAT_FIXTURE, join(dir, "chat_history.jsonl"));
    await writeFile(
      join(dir, "summary.json"),
      JSON.stringify({
        info: { id: sessionId, cwd: "/workspace/grok-discovery" },
        created_at: "2026-09-12T10:00:00.000Z",
        updated_at: "2026-09-12T10:05:00.000Z",
        current_model_id: "grok-4.6",
      }),
    );
    return dir;
  };

  const seedOpenCodeDb = async (fakeHome: string, sessionId: string): Promise<string> => {
    const dir = join(fakeHome, ".local", "share", "opencode");
    await mkdir(dir, { recursive: true });
    const dbPath = join(dir, "opencode.db");
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE session (
        id TEXT PRIMARY KEY,
        directory TEXT NOT NULL,
        title TEXT NOT NULL,
        agent TEXT,
        model TEXT,
        version TEXT,
        time_created INTEGER NOT NULL,
        time_updated INTEGER NOT NULL
      );
      CREATE TABLE message (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        time_created INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE TABLE part (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        time_created INTEGER NOT NULL,
        data TEXT NOT NULL
      );
    `);
    db.prepare(
      "INSERT INTO session (id, directory, title, agent, model, version, time_created, time_updated) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(sessionId, "/workspace/discovery-project", "discovery", "build", null, "1.0.0", 1000, 2000);
    db.prepare("INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)").run(
      "msg_1",
      sessionId,
      1000,
      JSON.stringify({ role: "user", time: { created: 1000 } }),
    );
    db.prepare(
      "INSERT INTO part (id, message_id, session_id, time_created, data) VALUES (?, ?, ?, ?, ?)",
    ).run(
      "prt_1",
      "msg_1",
      sessionId,
      2000,
      JSON.stringify({ type: "text", text: "hello" }),
    );
    db.close();
    return dbPath;
  };

  const importLineFor = (output: string, harness: string): string => {
    const line = output.split("\n").find((entry) => entry.includes(`harnie import ${harness} `));
    expect(line).toBeDefined();
    return line ?? "";
  };

  it("lists pi and codex sessions with exact import commands", async () => {
    const fakeHome = await makeTemp("harnie-sessions-pi-codex-");
    setDiscoveryHome(fakeHome);
    const piPath = await seedPiSession(fakeHome, "2026-09-01T00-00-01-000Z_abc123.jsonl");
    const codexPath = await seedCodexSession(
      fakeHome,
      "rollout-2026-09-07T00-00-00-abc123.jsonl",
    );

    const stdout = capture();
    const code = await runSessions([], { stdout, stderr: capture(), env: process.env });

    expect(code).toBe(0);
    const output = stdout.toString();
    expect(output).toContain(`harnie import pi "${piPath}"`);
    expect(output).toContain(`harnie import codex "${codexPath}"`);
    expect(output).toContain("--workspace-proj--");
    expect(output).toContain("/workspace/codex-project");
  });

  it("imports the sessions-listed pi and codex paths end to end", async () => {
    const fakeHome = await makeTemp("harnie-sessions-e2e-");
    setDiscoveryHome(fakeHome);
    await seedPiSession(fakeHome, "2026-09-01T00-00-01-000Z_abc123.jsonl");
    await seedCodexSession(fakeHome, "rollout-2026-09-07T00-00-00-abc123.jsonl");
    const home = await makeTemp("harnie-sessions-e2e-store-");

    const listed = capture();
    expect(await runSessions([], { stdout: listed, stderr: capture(), env: process.env })).toBe(0);
    const piLine = importLineFor(listed.toString(), "pi");
    const codexLine = importLineFor(listed.toString(), "codex");
    const piPath = piLine.split('harnie import pi "')[1]?.replace(/"$/, "");
    const codexPath = codexLine.split('harnie import codex "')[1]?.replace(/"$/, "");
    expect(piPath).toBeDefined();
    expect(codexPath).toBeDefined();

    const piOut = capture();
    expect(await runImport(["pi", piPath ?? ""], { home, stdout: piOut, stderr: capture() })).toBe(0);
    expect(piOut.toString()).toContain("work:pi:");

    const codexOut = capture();
    expect(
      await runImport(["codex", codexPath ?? ""], { home, stdout: codexOut, stderr: capture() }),
    ).toBe(0);
    expect(codexOut.toString()).toContain("work:codex:");
  });

  it("lists opencode sessions from the fixture database with session-id import commands", async () => {
    const fakeHome = await makeTemp("harnie-sessions-opencode-");
    setDiscoveryHome(fakeHome);
    await seedOpenCodeDb(fakeHome, "ses_fixture123");

    const stdout = capture();
    const code = await runSessions(["--harness", "opencode"], {
      stdout,
      stderr: capture(),
      env: process.env,
    });

    expect(code).toBe(0);
    const output = stdout.toString();
    expect(output).toContain("ses_fixture123");
    expect(output).toContain("/workspace/discovery-project");
    expect(output).toContain("harnie import opencode ses_fixture123");
  });

  it("lists grok sessions with exact import commands", async () => {
    const fakeHome = await makeTemp("harnie-sessions-grok-");
    setDiscoveryHome(fakeHome);
    const sessionDir = await seedGrokSession(
      fakeHome,
      "%2Fworkspace%2Fgrok-proj",
      "01grokdiscovery00000000000001",
    );

    const stdout = capture();
    const code = await runSessions(["--harness", "grok"], {
      stdout,
      stderr: capture(),
      env: process.env,
    });

    expect(code).toBe(0);
    const output = stdout.toString();
    expect(output).toContain("01grokdiscovery00000000000001");
    expect(output).toContain("/workspace/grok-discovery");
    expect(output).toContain(`harnie import grok "${sessionDir}"`);
  });

  it("imports the sessions-listed grok path end to end", async () => {
    const fakeHome = await makeTemp("harnie-sessions-grok-e2e-");
    setDiscoveryHome(fakeHome);
    await seedGrokSession(fakeHome, "%2Fworkspace%2Fgrok-proj", "01grokdiscovery00000000000002");
    const home = await makeTemp("harnie-sessions-grok-e2e-store-");

    const listed = capture();
    expect(await runSessions(["--harness", "grok"], {
      stdout: listed,
      stderr: capture(),
      env: process.env,
    })).toBe(0);
    const grokLine = importLineFor(listed.toString(), "grok");
    const grokPath = grokLine.split('harnie import grok "')[1]?.replace(/"$/, "");
    expect(grokPath).toBeDefined();

    const grokOut = capture();
    expect(await runImport(["grok", grokPath ?? ""], { home, stdout: grokOut, stderr: capture() })).toBe(0);
    expect(grokOut.toString()).toContain("work:grok:");
  });

  it("imports an opencode session id from the discovered database", async () => {
    const fakeHome = await makeTemp("harnie-sessions-ocimport-");
    setDiscoveryHome(fakeHome);
    await seedOpenCodeDb(fakeHome, "ses_fixture456");
    const home = await makeTemp("harnie-sessions-ocimport-store-");

    const stdout = capture();
    const stderr = capture();
    const code = await runImport(["opencode", "ses_fixture456"], { home, stdout, stderr });

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(stdout.toString()).toContain("Imported opencode session.");
    expect(stdout.toString()).toContain("work:opencode:");
  });

  it("resolves codex project when session_meta exceeds one read chunk", async () => {
    const fakeHome = await makeTemp("harnie-sessions-bigmeta-");
    setDiscoveryHome(fakeHome);
    const dir = join(fakeHome, ".codex", "sessions", "2026", "09", "07");
    await mkdir(dir, { recursive: true });
    const header = {
      timestamp: "2026-09-07T00:00:00.000Z",
      type: "session_meta",
      payload: {
        id: "bigmeta000000000000000001",
        cwd: "/workspace/bigmeta-project",
        padding: "x".repeat(20000),
      },
    };
    await writeFile(join(dir, "rollout-2026-09-07T00-00-00-bigmeta.jsonl"), `${JSON.stringify(header)}\n`);

    const stdout = capture();
    expect(await runSessions(["--harness", "codex"], {
      stdout,
      stderr: capture(),
      env: process.env,
    })).toBe(0);
    expect(stdout.toString()).toContain("/workspace/bigmeta-project");
  });

  it("filters by --harness", async () => {
    const fakeHome = await makeTemp("harnie-sessions-filter-");
    setDiscoveryHome(fakeHome);
    await seedPiSession(fakeHome, "2026-09-01T00-00-01-000Z_abc123.jsonl");
    await seedCodexSession(fakeHome, "rollout-2026-09-07T00-00-00-abc123.jsonl");

    const stdout = capture();
    expect(
      await runSessions(["--harness", "pi"], { stdout, stderr: capture(), env: process.env }),
    ).toBe(0);
    expect(stdout.toString()).toContain("harnie import pi ");
    expect(stdout.toString()).not.toContain("harnie import codex ");

    const equalsForm = capture();
    expect(
      await runSessions(["--harness=codex"], {
        stdout: equalsForm,
        stderr: capture(),
        env: process.env,
      }),
    ).toBe(0);
    expect(equalsForm.toString()).toContain("harnie import codex ");
    expect(equalsForm.toString()).not.toContain("harnie import pi ");
  });

  it("returns empty results with hints instead of crashing when nothing exists", async () => {
    const fakeHome = await makeTemp("harnie-sessions-empty-");
    setDiscoveryHome(fakeHome);

    const stdout = capture();
    const code = await runSessions([], { stdout, stderr: capture(), env: process.env });

    expect(code).toBe(0);
    const output = stdout.toString();
    expect(output).toMatch(/No pi sessions found/);
    expect(output).toMatch(/No codex sessions found/);
    expect(output).toMatch(/No grok sessions found/);
    expect(output).toMatch(/No opencode sessions found/);
    // Hints point at the overridden scan roots, proving no dependence on real machine state.
    expect(output).toContain(join(fakeHome, ".pi", "agent", "sessions"));
    expect(output).toContain(join(fakeHome, ".grok", "sessions"));
    expect(output).not.toContain(homedir() + "/.pi");
  });

  it("prints help with exit 0", async () => {
    const stdout = capture();
    expect(await runSessions(["--help"], { stdout, stderr: capture() })).toBe(0);
    expect(stdout.toString()).toMatch(/Usage: harnie sessions/);
    expect(stdout.toString()).toContain("--harness");
  });

  it("rejects an unknown harness and lists the four", async () => {
    const stderr = capture();
    const code = await runSessions(["--harness", "claude"], {
      stdout: capture(),
      stderr,
    });

    expect(code).toBe(1);
    expect(stderr.toString()).toContain("pi");
    expect(stderr.toString()).toContain("opencode");
    expect(stderr.toString()).toContain("codex");
    expect(stderr.toString()).toContain("grok");
  });

  it("rejects positional args with usage and exit 1", async () => {
    const stderr = capture();
    expect(await runSessions(["pi"], { stdout: capture(), stderr })).toBe(1);
    expect(stderr.toString()).toMatch(/Usage: harnie sessions/);
  });

  it("never initializes a Harnie store", async () => {
    const fakeHome = await makeTemp("harnie-sessions-nostore-");
    setDiscoveryHome(fakeHome);
    const home = await makeTemp("harnie-sessions-nostore-home-");

    expect(await runSessions([], { home, stdout: capture(), stderr: capture() })).toBe(0);
    expect(existsSync(join(home, "harnie.db"))).toBe(false);
  });
});

describe("harnie import actionable errors", () => {
  const temps: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-import-errors-"));
    temps.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(temps.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("suggests sessions when the file does not exist", async () => {
    for (const harness of ["pi", "opencode", "codex", "grok"] as const) {
      const home = await makeHome();
      const stderr = capture();
      const code = await runImport([harness, join("nope", "missing.jsonl")], {
        home,
        stdout: capture(),
        stderr,
      });
      expect(code).toBe(1);
      expect(stderr.toString()).toMatch(/not found/);
      expect(stderr.toString()).toContain("harnie sessions");
    }
  });

  it("names the expected codex rollout format with an example", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harnie-import-bad-codex-"));
    temps.push(dir);
    const bad = join(dir, "bad.jsonl");
    await writeFile(bad, "this is not json\n");
    const home = await makeHome();

    const stderr = capture();
    expect(await runImport(["codex", bad], { home, stdout: capture(), stderr })).toBe(1);
    expect(stderr.toString()).toMatch(/session_meta/);
    expect(stderr.toString()).toContain("rollout-*.jsonl");
  });

  it("names the expected opencode snapshot format with an example", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harnie-import-bad-opencode-"));
    temps.push(dir);
    const bad = join(dir, "bad.json");
    await writeFile(bad, "{}\n");
    const home = await makeHome();

    const stderr = capture();
    expect(await runImport(["opencode", bad], { home, stdout: capture(), stderr })).toBe(1);
    expect(stderr.toString()).toContain("opencode-session-v1");
    expect(stderr.toString()).toContain("ses_");
  });

  it("names the expected pi format when the path is not a file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "harnie-import-bad-pi-"));
    temps.push(dir);
    const home = await makeHome();

    const stderr = capture();
    expect(await runImport(["pi", dir], { home, stdout: capture(), stderr })).toBe(1);
    expect(stderr.toString()).toContain("Pi session JSONL");
    expect(stderr.toString()).toContain("harnie sessions");
  });

  it("lists the four harnesses for an unknown harness", async () => {
    const stderr = capture();
    const code = await runImport(["claude", "whatever.jsonl"], {
      stdout: capture(),
      stderr,
    });

    expect(code).toBe(1);
    expect(stderr.toString()).toContain("pi");
    expect(stderr.toString()).toContain("opencode");
    expect(stderr.toString()).toContain("codex");
    expect(stderr.toString()).toContain("grok");
  });

  it("prints import help with exit 0 describing per-harness paths", async () => {
    const stdout = capture();
    const code = await runImport(["--help"], { stdout, stderr: capture() });

    expect(code).toBe(0);
    const output = stdout.toString();
    expect(output).toMatch(/Usage: harnie import/);
    expect(output).toContain("~/.pi/agent/sessions");
    expect(output).toContain("~/.codex/sessions");
    expect(output).toContain("~/.grok/sessions");
    expect(output).toContain("opencode.db");
    expect(output).toContain("harnie sessions");
  });
});
