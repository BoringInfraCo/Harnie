import { statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHandoff } from "../src/cli/handoff.js";
import { importPiSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";

const isPosix = process.platform !== "win32";
const modeOf = (path: string): string => (statSync(path).mode & 0o777).toString(8);

const TRACE_B = "tests/fixtures/pi/trace-b-unfinished.jsonl";
const TRACE_B_WORK_ID = "work:pi:harnie-tb-da82c4f8";

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

describe.skipIf(!isPosix)("harnie handoff artifact permissions at creation", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-handoff-perms-"));
    homes.push(home);
    return home;
  };

  const seedStore = async (home: string): Promise<string> => {
    const store = initHarnieStore({ home });
    try {
      return (await importPiSessionFile(store, TRACE_B)).workId;
    } finally {
      store.close();
    }
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("creates handoffs/ 0700 and the artifact 0600 in the same write path", async () => {
    const home = await makeHome();
    const workId = await seedStore(home);

    const stdout = capture();
    const stderr = capture();
    const code = await runHandoff([workId, "--to", "opencode"], { home, stdout, stderr });
    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");

    // Asserted immediately after runHandoff: no later store open may have
    // tightened these — the modes must come from the write path itself.
    expect(modeOf(join(home, "handoffs"))).toBe("700");
    expect(modeOf(join(home, "handoffs", `${TRACE_B_WORK_ID.replaceAll(":", "_")}.md`))).toBe("600");
  });

  it("applies the same create-time modes in --json mode and for checkpoint handoffs", async () => {
    const home = await makeHome();
    const workId = await seedStore(home);

    const stdout = capture();
    const stderr = capture();
    const code = await runHandoff([workId, "--to", "codex", "--json"], { home, stdout, stderr });
    expect(code).toBe(0);

    expect(modeOf(join(home, "handoffs"))).toBe("700");
    expect(
      modeOf(join(home, "handoffs", `${TRACE_B_WORK_ID.replaceAll(":", "_")}.codex.md`)),
    ).toBe("600");

    const envelope = JSON.parse(stdout.toString()) as { ok: boolean; data: { file: string } };
    expect(envelope.ok).toBe(true);
    expect(modeOf(envelope.data.file)).toBe("600");
  });
});
