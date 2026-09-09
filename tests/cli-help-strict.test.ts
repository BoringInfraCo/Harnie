import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import type { JsonEnvelope } from "../src/contract/envelope.js";

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

describe("help requires valid arguments first", () => {
  const homes: string[] = [];

  const makeHome = (): string => {
    const home = mkdtempSync(join(tmpdir(), "harnie-help-strict-"));
    homes.push(home);
    return home;
  };

  afterEach(() => {
    for (const home of homes.splice(0)) {
      rmSync(home, { recursive: true, force: true });
    }
  });

  const commands = ["backup", "restore", "import", "sessions"] as const;

  for (const command of commands) {
    it(`${command} --help alone prints help and exits 0`, async () => {
      const stdout = capture();
      expect(await runCli([command, "--help"], { home: makeHome(), stdout, stderr: capture() })).toBe(0);
      expect(stdout.toString()).toMatch(new RegExp(`usage: harnie ${command}`, "i"));
    });

    it(`${command} -h alone prints help and exits 0`, async () => {
      const stdout = capture();
      expect(await runCli([command, "-h"], { home: makeHome(), stdout, stderr: capture() })).toBe(0);
      expect(stdout.toString()).toMatch(new RegExp(`usage: harnie ${command}`, "i"));
    });

    it(`${command} --help --bogus exits 1 with the unknown-flag error`, async () => {
      const stderr = capture();
      expect(await runCli([command, "--help", "--bogus"], { home: makeHome(), stdout: capture(), stderr })).toBe(1);
      // Sessions keeps its pinned text style: usage-only, no message.
      if (command === "sessions") {
        expect(stderr.toString()).toMatch(/usage: harnie sessions/i);
      } else {
        expect(stderr.toString()).toMatch(/Unknown flag: --bogus/);
      }
    });

    it(`${command} --bogus --help exits 1 with the unknown-flag error`, async () => {
      const stderr = capture();
      expect(await runCli([command, "--bogus", "--help"], { home: makeHome(), stdout: capture(), stderr })).toBe(1);
      if (command === "sessions") {
        expect(stderr.toString()).toMatch(/usage: harnie sessions/i);
      } else {
        expect(stderr.toString()).toMatch(/Unknown flag: --bogus/);
      }
    });

    it(`${command} -h --bogus exits 1 with the unknown-flag error`, async () => {
      const stderr = capture();
      expect(await runCli([command, "-h", "--bogus"], { home: makeHome(), stdout: capture(), stderr })).toBe(1);
      if (command === "sessions") {
        expect(stderr.toString()).toMatch(/usage: harnie sessions/i);
      } else {
        expect(stderr.toString()).toMatch(/Unknown flag: --bogus/);
      }
    });
  }

  it("sessions --json --help --bogus answers with a JSON error envelope", async () => {
    const stdout = capture();
    const code = await runCli(["sessions", "--json", "--help", "--bogus"], {
      home: makeHome(),
      stdout,
      stderr: capture(),
    });
    expect(code).toBe(1);
    const envelope = parseEnvelope(stdout.toString());
    expect(envelope.ok).toBe(false);
    if (envelope.ok !== false) throw new Error("expected failure envelope");
    expect(envelope.command).toBe("sessions");
    expect(envelope.error.code).toBe("unknown_flag");
    expect(envelope.error.message).toMatch(/Unknown flag: --bogus/);
  });

  it("sessions --json --help alone prints help and exits 0", async () => {
    const stdout = capture();
    expect(await runCli(["sessions", "--json", "--help"], { home: makeHome(), stdout, stderr: capture() })).toBe(0);
    expect(stdout.toString()).toMatch(/usage: harnie sessions/i);
  });
});
