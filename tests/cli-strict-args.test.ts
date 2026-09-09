import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import type { JsonEnvelope } from "../src/contract/envelope.js";

const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";
const WORK = "work:pi:harnie-tb-da82c4f8";

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

describe("strict arguments for every command", () => {
  const homes: string[] = [];

  const makeHome = (): string => {
    const home = mkdtempSync(join(tmpdir(), "harnie-strict-args-"));
    homes.push(home);
    return home;
  };

  afterEach(() => {
    for (const home of homes.splice(0)) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("init rejects unknown flags and surplus positionals", async () => {
    const unknownStderr = capture();
    expect(await runCli(["init", "--bogus"], { home: makeHome(), stdout: capture(), stderr: unknownStderr })).toBe(1);
    expect(unknownStderr.toString()).toMatch(/Unknown flag: --bogus/);

    const surplusStderr = capture();
    expect(await runCli(["init", "extra"], { home: makeHome(), stdout: capture(), stderr: surplusStderr })).toBe(1);
    expect(surplusStderr.toString()).toMatch(/usage: harnie init/i);
  });

  it("import rejects unknown flags, duplicate value flags, and surplus positionals", async () => {
    const home = makeHome();
    const unknownStderr = capture();
    expect(await runCli(["import", "pi", TRACE_B, "--bogus"], { home, stdout: capture(), stderr: unknownStderr })).toBe(1);
    expect(unknownStderr.toString()).toMatch(/Unknown flag: --bogus/);

    const duplicateStderr = capture();
    expect(
      await runCli(["import", "pi", TRACE_B, "--work", "work:pi:a", "--work", "work:pi:b"], {
        home,
        stdout: capture(),
        stderr: duplicateStderr,
      }),
    ).toBe(1);
    expect(duplicateStderr.toString()).toMatch(/Duplicate flag: --work/);

    const surplusStderr = capture();
    expect(await runCli(["import", "pi", TRACE_B, "extra"], { home, stdout: capture(), stderr: surplusStderr })).toBe(1);
    expect(surplusStderr.toString()).toMatch(/usage: harnie import pi/i);
  });

  it("sessions rejects unknown flags, duplicate value flags, and surplus positionals", async () => {
    const home = makeHome();
    // Text mode keeps the existing sessions style: usage-only, no message.
    const unknownStderr = capture();
    expect(await runCli(["sessions", "--bogus"], { home, stdout: capture(), stderr: unknownStderr })).toBe(1);
    expect(unknownStderr.toString()).toMatch(/usage: harnie sessions/i);

    const duplicateStderr = capture();
    expect(
      await runCli(["sessions", "--harness", "pi", "--harness", "opencode"], { home, stdout: capture(), stderr: duplicateStderr }),
    ).toBe(1);
    expect(duplicateStderr.toString()).toMatch(/usage: harnie sessions/i);

    const surplusStderr = capture();
    expect(await runCli(["sessions", "extra"], { home, stdout: capture(), stderr: surplusStderr })).toBe(1);
    expect(surplusStderr.toString()).toMatch(/usage: harnie sessions/i);
  });

  it("list rejects unknown flags and surplus positionals", async () => {
    const home = makeHome();
    const unknownStderr = capture();
    expect(await runCli(["list", "--bogus"], { home, stdout: capture(), stderr: unknownStderr })).toBe(1);
    expect(unknownStderr.toString()).toMatch(/Unknown flag: --bogus/);

    const surplusStderr = capture();
    expect(await runCli(["list", "extra"], { home, stdout: capture(), stderr: surplusStderr })).toBe(1);
    expect(surplusStderr.toString()).toMatch(/usage: harnie list/i);
  });

  it("show rejects unknown flags and surplus positionals", async () => {
    const home = makeHome();
    const unknownStderr = capture();
    expect(await runCli(["show", WORK, "--bogus"], { home, stdout: capture(), stderr: unknownStderr })).toBe(1);
    expect(unknownStderr.toString()).toMatch(/Unknown flag: --bogus/);

    const surplusStderr = capture();
    expect(await runCli(["show", "work:a", "work:b"], { home, stdout: capture(), stderr: surplusStderr })).toBe(1);
    expect(surplusStderr.toString()).toMatch(/exactly one work id/i);
  });

  it("executions rejects unknown flags and surplus positionals", async () => {
    const home = makeHome();
    const unknownStderr = capture();
    expect(await runCli(["executions", WORK, "--bogus"], { home, stdout: capture(), stderr: unknownStderr })).toBe(1);
    expect(unknownStderr.toString()).toMatch(/Unknown flag: --bogus/);

    const surplusStderr = capture();
    expect(await runCli(["executions", "work:a", "work:b"], { home, stdout: capture(), stderr: surplusStderr })).toBe(1);
    expect(surplusStderr.toString()).toMatch(/exactly one work id/i);
  });

  it("history rejects unknown flags and surplus positionals", async () => {
    const home = makeHome();
    const unknownStderr = capture();
    expect(await runCli(["history", WORK, "--bogus"], { home, stdout: capture(), stderr: unknownStderr })).toBe(1);
    expect(unknownStderr.toString()).toMatch(/Unknown flag: --bogus/);

    const surplusStderr = capture();
    expect(await runCli(["history", "work:a", "work:b"], { home, stdout: capture(), stderr: surplusStderr })).toBe(1);
    expect(surplusStderr.toString()).toMatch(/exactly one work id/i);
  });

  it("checkpoint rejects unknown flags", async () => {
    const stderr = capture();
    expect(await runCli(["checkpoint", WORK, "--bogus"], { home: makeHome(), stdout: capture(), stderr })).toBe(1);
    expect(stderr.toString()).toMatch(/Unknown flag: --bogus/);
  });

  it("fork rejects unknown flags and duplicate value flags", async () => {
    const home = makeHome();
    const unknownStderr = capture();
    expect(await runCli(["fork", WORK, "--bogus"], { home, stdout: capture(), stderr: unknownStderr })).toBe(1);
    expect(unknownStderr.toString()).toMatch(/Unknown flag: --bogus/);

    const duplicateStderr = capture();
    expect(
      await runCli(["fork", WORK, "--checkpoint", "c1", "--checkpoint", "c2"], { home, stdout: capture(), stderr: duplicateStderr }),
    ).toBe(1);
    expect(duplicateStderr.toString()).toMatch(/Duplicate flag: --checkpoint/);
  });

  it("diff rejects unknown flags and surplus positionals", async () => {
    const home = makeHome();
    const unknownStderr = capture();
    expect(await runCli(["diff", "work:a", "exec:a", "exec:b", "--bogus"], { home, stdout: capture(), stderr: unknownStderr })).toBe(1);
    expect(unknownStderr.toString()).toMatch(/Unknown flag: --bogus/);

    const surplusStderr = capture();
    expect(await runCli(["diff", "work:a", "exec:a", "exec:b", "exec:c"], { home, stdout: capture(), stderr: surplusStderr })).toBe(1);
    expect(surplusStderr.toString()).toMatch(/exactly three arguments/i);
  });

  it("handoff rejects unknown flags and surplus positionals", async () => {
    const home = makeHome();
    const unknownStderr = capture();
    expect(await runCli(["handoff", WORK, "--to", "pi", "--bogus"], { home, stdout: capture(), stderr: unknownStderr })).toBe(1);
    expect(unknownStderr.toString()).toMatch(/usage: harnie handoff/i);

    const surplusStderr = capture();
    expect(await runCli(["handoff", "work:a", "work:b", "--to", "pi"], { home, stdout: capture(), stderr: surplusStderr })).toBe(1);
    expect(surplusStderr.toString()).toMatch(/usage: harnie handoff/i);
  });

  it("backup rejects unknown flags and surplus positionals", async () => {
    const home = makeHome();
    const unknownStderr = capture();
    expect(await runCli(["backup", "backup.db", "--bogus"], { home, stdout: capture(), stderr: unknownStderr })).toBe(1);
    expect(unknownStderr.toString()).toMatch(/Unknown flag: --bogus/);

    const surplusStderr = capture();
    expect(await runCli(["backup", "a.db", "b.db"], { home, stdout: capture(), stderr: surplusStderr })).toBe(1);
    expect(surplusStderr.toString()).toMatch(/usage: harnie backup/i);
  });

  it("restore rejects unknown flags, duplicate switches, and surplus positionals", async () => {
    const home = makeHome();
    const unknownStderr = capture();
    expect(await runCli(["restore", "backup.db", "--bogus"], { home, stdout: capture(), stderr: unknownStderr })).toBe(1);
    expect(unknownStderr.toString()).toMatch(/Unknown flag: --bogus/);

    const duplicateStderr = capture();
    expect(
      await runCli(["restore", "backup.db", "--force", "--force"], { home, stdout: capture(), stderr: duplicateStderr }),
    ).toBe(1);
    expect(duplicateStderr.toString()).toMatch(/Duplicate flag: --force/);

    const surplusStderr = capture();
    expect(await runCli(["restore", "a.db", "b.db"], { home, stdout: capture(), stderr: surplusStderr })).toBe(1);
    expect(surplusStderr.toString()).toMatch(/usage: harnie restore/i);
  });

  it("accepts both --flag value and --flag=value spellings", async () => {
    const separateStdout = capture();
    expect(await runCli(["sessions", "--harness", "pi"], { home: makeHome(), stdout: separateStdout, stderr: capture() })).toBe(0);

    const equalsStdout = capture();
    expect(await runCli(["sessions", "--harness=pi"], { home: makeHome(), stdout: equalsStdout, stderr: capture() })).toBe(0);
    expect(equalsStdout.toString()).toBe(separateStdout.toString());
  });

  it("JSON-mode commands answer flag violations with a stable error envelope", async () => {
    const cases: Array<[string, string[]]> = [
      ["sessions", ["--bogus", "--json"]],
      ["list", ["--bogus", "--json"]],
      ["show", [WORK, "--bogus", "--json"]],
      ["executions", [WORK, "--bogus", "--json"]],
      ["history", [WORK, "--bogus", "--json"]],
      ["diff", ["work:a", "exec:a", "exec:b", "--bogus", "--json"]],
      ["handoff", [WORK, "--to", "pi", "--bogus", "--json"]],
    ];
    for (const [command, args] of cases) {
      const stdout = capture();
      const code = await runCli([command, ...args], { home: makeHome(), stdout, stderr: capture() });
      const envelope = parseEnvelope(stdout.toString());
      expect(code, `${command} exits 1`).toBe(1);
      expect(envelope.ok, `${command} ok=false`).toBe(false);
      if (envelope.ok !== false) throw new Error("expected failure envelope");
      expect(envelope.command, `${command} names itself`).toBe(command);
      expect(envelope.error.code, `${command} code`).toBe("unknown_flag");
      expect(envelope.error.message, `${command} message`).toMatch(/Unknown flag: --bogus/);
    }
  });
});
