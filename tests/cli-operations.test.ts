import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runShow } from "../src/cli/show.js";
import { importPiSessionFile } from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";

const FIXTURE_C = "tests/fixtures/pi/stateful-prefix.jsonl";
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

describe("harnie show operations", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-cli-ops-"));
    homes.push(home);
    return home;
  };

  const seedImported = async (home: string, path: string): Promise<string> => {
    const store = initHarnieStore({ home });
    try {
      return (await importPiSessionFile(store, path)).workId;
    } finally {
      store.close();
    }
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("shows Fixture C successful edits of models.ts and types.ts", async () => {
    const home = await makeHome();
    const workId = await seedImported(home, FIXTURE_C);
    const stdout = capture();
    const stderr = capture();

    const code = await runShow([workId], { home, stdout, stderr });
    const output = stdout.toString();

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(output).toContain("packages/ai/src/models.ts");
    expect(output).toContain("packages/agent/src/types.ts");
    expect(output).toMatch(/succeeded/);
    expect(output).toContain("Events");
    expect(output).not.toMatch(/\bfile_read\b/);
    expect(output).not.toMatch(/\bfile_write\b/);
    expectObservedAfterOperations(output);
  });

  it("shows Trace B files including pending .git/config without file_read event kinds", async () => {
    const home = await makeHome();
    const workId = await seedImported(home, TRACE_B);
    const stdout = capture();
    const stderr = capture();

    const code = await runShow([workId], { home, stdout, stderr });
    const output = stdout.toString();

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    expect(output).toContain("README.md");
    expect(output).toContain(".git/config");
    expect(output).toMatch(/pending/);
    expect(output).toContain("Events");
    expect(output).not.toMatch(/\bfile_read\b/);
    expect(output).not.toMatch(/\bfile_write\b/);
    expect(output).not.toContain("# Mystery Project\n\nA project that needs");
    expect(output).not.toMatch(/\btotal 16\b/);
    expectObservedAfterOperations(output);
  });
});

const OBSERVED_HEADINGS = [
  "Repository",
  "Relevant files",
  "Changed files",
  "Failed approaches",
  "Test state",
  "Read yields",
] as const;

const expectObservedAfterOperations = (output: string): void => {
  const headings = output.split("\n\n").map((block) => block.split("\n")[0] ?? "");
  const operationsIndex = headings.indexOf("Operations");
  const boundIndex = headings.findIndex(
    (heading, index) => index > operationsIndex && (heading === "Checkpoints" || heading === "Events"),
  );
  for (const heading of OBSERVED_HEADINGS) {
    const at = headings.indexOf(heading);
    if (at === -1) continue;
    expect(operationsIndex).toBeGreaterThanOrEqual(0);
    expect(at).toBeGreaterThan(operationsIndex);
    if (boundIndex !== -1) {
      expect(at).toBeLessThan(boundIndex);
    }
  }
};
