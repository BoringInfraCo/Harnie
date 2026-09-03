import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

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

describe("harnie init", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-cli-"));
    homes.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("creates harnie.db and returns 0", async () => {
    const home = await makeHome();
    const stdout = capture();
    const dbPath = join(home, "harnie.db");

    const code = await runCli(["init"], { home, stdout });

    expect(code).toBe(0);
    expect(existsSync(dbPath)).toBe(true);
    expect(stdout.toString()).toContain(dbPath);
  });

  it("is idempotent on a second init", async () => {
    const home = await makeHome();
    const first = capture();
    const second = capture();

    expect(await runCli(["init"], { home, stdout: first })).toBe(0);
    expect(await runCli(["init"], { home, stdout: second })).toBe(0);
    expect(existsSync(join(home, "harnie.db"))).toBe(true);
  });

  it("mentions the database path on stdout", async () => {
    const home = await makeHome();
    const stdout = capture();

    await runCli(["init"], { home, stdout });

    expect(stdout.toString()).toContain(join(home, "harnie.db"));
    expect(stdout.toString()).toContain("Initialized Harnie.");
  });

  it("returns non-zero for an unknown command", async () => {
    const stderr = capture();

    const code = await runCli(["not-a-command"], { stderr });

    expect(code).not.toBe(0);
    expect(stderr.toString()).toMatch(/unknown command/i);
  });

  it("prints usage and exits 1 when no command is given", async () => {
    const stderr = capture();

    const code = await runCli([], { stderr });

    expect(code).toBe(1);
    expect(stderr.toString()).toMatch(/usage: harnie/i);
  });

  it("prints usage and exits 0 for --help", async () => {
    const stdout = capture();

    const code = await runCli(["--help"], { stdout });

    expect(code).toBe(0);
    expect(stdout.toString()).toMatch(/usage: harnie/i);
  });

  it("prints usage when handoff is missing required arguments", async () => {
    const stderr = capture();

    const code = await runCli(["handoff"], { stderr });

    expect(code).toBe(1);
    expect(stderr.toString()).toMatch(/usage: harnie handoff/i);
  });
});
