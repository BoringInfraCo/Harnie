import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { runDiff } from "../src/cli/diff.js";
import { runExecutions } from "../src/cli/executions.js";
import { runHandoff } from "../src/cli/handoff.js";
import { runHistory } from "../src/cli/history.js";
import { runImport } from "../src/cli/import.js";
import { runList } from "../src/cli/list.js";
import { runSessions } from "../src/cli/sessions.js";
import { runShow } from "../src/cli/show.js";
import { importPiSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";
import type { JsonEnvelope } from "../src/contract/envelope.js";

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

const parseEnvelope = (output: string): JsonEnvelope => JSON.parse(output) as JsonEnvelope;

describe("machine contract: stable error codes", () => {
  const homes: string[] = [];

  const makeHome = (): string => {
    const home = mkdtempSync(join(tmpdir(), "harnie-contract-errors-"));
    homes.push(home);
    return home;
  };

  const seed = async (home: string): Promise<string> => {
    const store = initHarnieStore({ home });
    try {
      return (await importPiSessionFile(store, TRACE_B)).workId;
    } finally {
      store.close();
    }
  };

  afterEach(() => {
    for (const home of homes.splice(0)) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("rejects unknown flags with unknown_flag on the inspection commands", async () => {
    const home = makeHome();
    await seed(home);
    const cases: Array<[string, (stdout: ReturnType<typeof capture>) => Promise<number>]> = [
      ["list", (stdout) => runList(["--bogus", "--json"], { home, stdout, stderr: capture() })],
      [
        "show",
        (stdout) => runShow(["work:pi:harnie-tb-da82c4f8", "--bogus", "--json"], { home, stdout, stderr: capture() }),
      ],
      [
        "executions",
        (stdout) =>
          runExecutions(["work:pi:harnie-tb-da82c4f8", "--verbose", "--json"], { home, stdout, stderr: capture() }),
      ],
      [
        "history",
        (stdout) => runHistory(["work:pi:harnie-tb-da82c4f8", "--all", "--json"], { home, stdout, stderr: capture() }),
      ],
      [
        "diff",
        (stdout) =>
          runDiff(["work:pi:harnie-tb-da82c4f8", "a", "b", "--wat", "--json"], { home, stdout, stderr: capture() }),
      ],
      ["handoff", (stdout) => runHandoff(["work:pi:harnie-tb-da82c4f8", "--to", "opencode", "--bogus", "--json"], { home, stdout, stderr: capture() })],
      ["sessions", (stdout) => runSessions(["--bogus", "--json"], { stdout, stderr: capture(), env: process.env })],
    ];
    for (const [command, run] of cases) {
      const stdout = capture();
      const code = await run(stdout);
      const envelope = parseEnvelope(stdout.toString());
      expect(command, `${command} exits 1`).toBeTruthy();
      expect(code, `${command} exits 1`).toBe(1);
      expect(envelope.schema, `${command} schema`).toBe("harnie.cli.v1");
      expect(envelope.ok, `${command} ok=false`).toBe(false);
      if (envelope.ok !== false) throw new Error("expected failure envelope");
      expect(envelope.command, `${command} names itself`).toBe(command);
      expect(envelope.error.code, `${command} code`).toBe("unknown_flag");
    }
  });

  it("rejects duplicate flags with duplicate_flag", async () => {
    const home = makeHome();
    await seed(home);
    const showStdout = capture();
    expect(
      await runShow(["work:pi:harnie-tb-da82c4f8", "--json", "--json"], { home, stdout: showStdout, stderr: capture() }),
    ).toBe(1);
    const showEnvelope = parseEnvelope(showStdout.toString());
    if (showEnvelope.ok !== false) throw new Error("expected failure envelope");
    expect(showEnvelope.error.code).toBe("duplicate_flag");

    const handoffStdout = capture();
    expect(
      await runHandoff(["work:pi:harnie-tb-da82c4f8", "--to", "opencode", "--checkpoint", "c1", "--checkpoint", "c2", "--json"], {
        home,
        stdout: handoffStdout,
        stderr: capture(),
      }),
    ).toBe(1);
    const handoffEnvelope = parseEnvelope(handoffStdout.toString());
    if (handoffEnvelope.ok !== false) throw new Error("expected failure envelope");
    expect(handoffEnvelope.error.code).toBe("duplicate_flag");
  });

  it("import rejects unknown and duplicate flags with exit 1", async () => {
    const home = makeHome();
    const unknownStderr = capture();
    expect(
      await runImport(["pi", TRACE_B, "--work", "work:pi:x", "--dry-run"], {
        home,
        stdout: capture(),
        stderr: unknownStderr,
      }),
    ).toBe(1);
    expect(unknownStderr.toString()).toMatch(/Unknown flag: --dry-run/);

    const duplicateStderr = capture();
    expect(
      await runImport(["pi", TRACE_B, "--work", "work:pi:a", "--work", "work:pi:b"], {
        home,
        stdout: capture(),
        stderr: duplicateStderr,
      }),
    ).toBe(1);
    expect(duplicateStderr.toString()).toMatch(/Duplicate flag: --work/);
  });

  it("import keeps accepting valid --work placement in any position", async () => {
    const home = makeHome();
    const stdout = capture();
    const stderr = capture();
    expect(await runImport(["--work", "work:pi:x", "pi", TRACE_B], { home, stdout, stderr })).toBe(1);
    expect(stderr.toString()).toMatch(/Work not found: work:pi:x/);

    const usageStderr = capture();
    expect(await runImport(["pi", TRACE_B, "--work"], { home, stdout: capture(), stderr: usageStderr })).toBe(1);
    expect(usageStderr.toString()).toMatch(/usage: harnie import pi/i);
  });

  it("maps missing arguments to missing_argument", async () => {
    const home = makeHome();
    initHarnieStore({ home }).close();

    const showStdout = capture();
    expect(await runShow(["--json"], { home, stdout: showStdout, stderr: capture() })).toBe(1);
    const showEnvelope = parseEnvelope(showStdout.toString());
    if (showEnvelope.ok !== false) throw new Error("expected failure envelope");
    expect(showEnvelope.error.code).toBe("missing_argument");
    expect(showEnvelope.error.message).toBe("Work id is required.");

    const diffStdout = capture();
    expect(await runDiff(["work:pi:a", "exec:b", "--json"], { home, stdout: diffStdout, stderr: capture() })).toBe(1);
    const diffEnvelope = parseEnvelope(diffStdout.toString());
    if (diffEnvelope.ok !== false) throw new Error("expected failure envelope");
    expect(diffEnvelope.error.code).toBe("missing_argument");
  });

  it("maps missing work/execution ids to not_found", async () => {
    const home = makeHome();
    initHarnieStore({ home }).close();

    for (const run of [
      (stdout: ReturnType<typeof capture>) =>
        runShow(["work:pi:missing", "--json"], { home, stdout, stderr: capture() }),
      (stdout: ReturnType<typeof capture>) =>
        runExecutions(["work:pi:missing", "--json"], { home, stdout, stderr: capture() }),
      (stdout: ReturnType<typeof capture>) =>
        runHistory(["work:pi:missing", "--json"], { home, stdout, stderr: capture() }),
      (stdout: ReturnType<typeof capture>) =>
        runHandoff(["work:pi:missing", "--to", "opencode", "--json"], { home, stdout, stderr: capture() }),
    ]) {
      const stdout = capture();
      expect(await run(stdout)).toBe(1);
      const envelope = parseEnvelope(stdout.toString());
      if (envelope.ok !== false) throw new Error("expected failure envelope");
      expect(envelope.error.code).toBe("not_found");
      expect(envelope.error.message).toMatch(/Work not found: work:pi:missing/);
    }
  });

  it("classifies unknown execution ids as not_found in diff --json", async () => {
    const home = makeHome();
    await seed(home);
    const stdout = capture();

    expect(
      await runDiff(["work:pi:harnie-tb-da82c4f8", "exec:missing-a", "exec:missing-b", "--json"], {
        home,
        stdout,
        stderr: capture(),
      }),
    ).toBe(1);
    const envelope = parseEnvelope(stdout.toString());
    if (envelope.ok !== false) throw new Error("expected failure envelope");
    expect(envelope.error.code).toBe("not_found");
    expect(envelope.error.message).toMatch(/Execution not found: exec:missing-a/);
  });

  it("maps unsupported targets to unsupported while text keeps the not-implemented phrasing", async () => {
    const home = makeHome();

    const jsonStdout = capture();
    expect(
      await runHandoff(["work:pi:abc", "--to", "foobar", "--json"], { home, stdout: jsonStdout, stderr: capture() }),
    ).toBe(1);
    const envelope = parseEnvelope(jsonStdout.toString());
    if (envelope.ok !== false) throw new Error("expected failure envelope");
    expect(envelope.error.code).toBe("unsupported");

    const textStderr = capture();
    expect(await runHandoff(["work:pi:abc", "--to", "foobar"], { home, stdout: capture(), stderr: textStderr })).toBe(1);
    expect(textStderr.toString()).toBe('Target "foobar" is not implemented.\n');
  });

  it("maps invalid sessions harness values to invalid_input", async () => {
    const stdout = capture();
    expect(await runSessions(["--harness", "claude", "--json"], { stdout, stderr: capture(), env: process.env })).toBe(1);
    const envelope = parseEnvelope(stdout.toString());
    if (envelope.ok !== false) throw new Error("expected failure envelope");
    expect(envelope.error.code).toBe("invalid_input");
    expect(envelope.error.message).toMatch(/Supported harnesses: pi, opencode, codex/);
  });

  it("reports unknown commands as text (the router cannot know the requested schema)", async () => {
    const stderr = capture();
    expect(await runCli(["frobnicate"], { home: makeHome(), stdout: capture(), stderr })).toBe(1);
    expect(stderr.toString()).toBe("Unknown command: frobnicate\n");
  });

  it("text error output is unchanged byte-for-byte", async () => {
    const home = makeHome();
    initHarnieStore({ home }).close();

    const showStderr = capture();
    expect(await runShow(["work:pi:missing"], { home, stdout: capture(), stderr: showStderr })).toBe(1);
    expect(showStderr.toString()).toBe("Work not found: work:pi:missing\n");

    const showMissingArg = capture();
    expect(await runShow([], { home, stdout: capture(), stderr: showMissingArg })).toBe(1);
    expect(showMissingArg.toString()).toBe("Work id is required.\n");

    const listUnknownFlag = capture();
    expect(await runList(["--bogus"], { home, stdout: capture(), stderr: listUnknownFlag })).toBe(1);
    expect(listUnknownFlag.toString()).toContain("Unknown flag: --bogus");
  });

  it("json errors go to stdout, never stderr", async () => {
    const home = makeHome();
    initHarnieStore({ home }).close();
    const stdout = capture();
    const stderr = capture();

    expect(await runShow(["work:pi:missing", "--json"], { home, stdout, stderr })).toBe(1);

    expect(stdout.toString()).toContain('"ok":false');
    expect(stderr.toString()).toBe("");
  });
});
