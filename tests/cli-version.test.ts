import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

const repository = fileURLToPath(new URL("..", import.meta.url));
const distCli = join(repository, "dist", "cli.js");

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

describe("harnie --version", () => {
  it("prints the package version and exits 0", async () => {
    const manifest = JSON.parse(readFileSync(join(repository, "package.json"), "utf8")) as {
      version: string;
    };
    const stdout = capture();
    expect(await runCli(["--version"], { stdout })).toBe(0);
    expect(stdout.toString()).toBe(`harnie ${manifest.version}\n`);
  });

  it("-V behaves the same", async () => {
    const stdout = capture();
    expect(await runCli(["-V"], { stdout })).toBe(0);
    expect(stdout.toString()).toMatch(/^harnie \S+\n$/);
  });

  it("does not need a Harnie home", async () => {
    const stdout = capture();
    expect(await runCli(["--version"], { stdout })).toBe(0);
  });

  it("is not accepted alongside other arguments", async () => {
    const stderr = capture();
    expect(await runCli(["--version", "extra"], { stdout: capture(), stderr })).toBe(1);
    expect(stderr.toString()).toMatch(/Unknown command: --version/);
  });

  it("works from the built dist (packed-install layout)", { skip: !existsSync(distCli) }, async () => {
    const home = mkdtempSync(join(tmpdir(), "harnie-version-dist-"));
    try {
      const result = spawnSync(process.execPath, [distCli, "--version"], {
        encoding: "utf8",
        env: { ...process.env, HARNIE_HOME: home },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toMatch(/^harnie \S+\n$/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
