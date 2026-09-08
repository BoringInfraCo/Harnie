import { chmodSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { databasePath, initHarnieStore } from "../src/store/database.js";

const isPosix = process.platform !== "win32";
const modeOf = (path: string): string => (statSync(path).mode & 0o777).toString(8);

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

describe.skipIf(!isPosix)("harnie store file permissions", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-perms-"));
    homes.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("creates the home directory 0700 and the SQLite file 0600", async () => {
    const home = await makeHome();
    const store = initHarnieStore({ home });
    store.close();

    expect(modeOf(home)).toBe("700");
    expect(modeOf(databasePath(home))).toBe("600");
  });

  it("tightens pre-existing loose permissions on open", async () => {
    const home = await makeHome();
    // Simulate a store created before private permissions existed.
    chmodSync(home, 0o755);
    const raw = new DatabaseSync(databasePath(home));
    raw.exec("CREATE TABLE t (id TEXT PRIMARY KEY)");
    raw.close();
    chmodSync(databasePath(home), 0o644);
    expect(modeOf(home)).toBe("755");
    expect(modeOf(databasePath(home))).toBe("644");

    const store = initHarnieStore({ home });
    store.close();

    expect(modeOf(home)).toBe("700");
    expect(modeOf(databasePath(home))).toBe("600");
  });

  it("converges handoff artifacts under home to 0600 on open", async () => {
    const home = await makeHome();
    expect(await runCli(["import", "pi", "tests/fixtures/pi/trace-b-unfinished.jsonl"], {
      home,
      stdout: capture(),
      stderr: capture(),
    })).toBe(0);
    expect(await runCli(["handoff", "work:pi:harnie-tb-da82c4f8", "--to", "opencode"], {
      home,
      stdout: capture(),
      stderr: capture(),
    })).toBe(0);

    const artifact = join(home, "handoffs", "work_pi_harnie-tb-da82c4f8.md");
    // The artifact is written after the store open, so it starts with default
    // modes; the next open must tighten it and its directory.
    chmodSync(artifact, 0o644);

    const store = initHarnieStore({ home });
    store.close();

    expect(modeOf(join(home, "handoffs"))).toBe("700");
    expect(modeOf(artifact)).toBe("600");
  });
});
