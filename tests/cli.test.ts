import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";

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

describe("harnie CLI wiring", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-cli-wire-"));
    homes.push(home);
    return home;
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("imports, lists, and shows Trace B through runCli", async () => {
    const home = await makeHome();
    const imported = capture();
    const listed = capture();
    const shown = capture();
    const handed = capture();
    const handedPi = capture();

    expect(await runCli(["init"], { home, stdout: capture() })).toBe(0);
    expect(await runCli(["import", "pi", TRACE_B], { home, stdout: imported })).toBe(0);
    expect(await runCli(["list"], { home, stdout: listed })).toBe(0);
    expect(await runCli(["show", "work:pi:harnie-tb-da82c4f8"], { home, stdout: shown })).toBe(0);
    expect(await runCli(["handoff", "work:pi:harnie-tb-da82c4f8", "--to", "opencode"], { home, stdout: handed })).toBe(0);
    expect(await runCli(["handoff", "work:pi:harnie-tb-da82c4f8", "--to", "pi"], { home, stdout: handedPi })).toBe(0);

    expect(imported.toString()).toContain("work:pi:harnie-tb-da82c4f8");
    expect(listed.toString()).toContain("work:pi:harnie-tb-da82c4f8");
    expect(listed.toString()).toContain("/workspace/pi-project");
    expect(shown.toString()).toContain("missing_tool_result");
    expect(shown.toString()).toContain("tool_call");
    expect(shown.toString()).toMatch(/\bGoal\b/);
    expect(shown.toString()).toMatch(/\bNext\b/);
    expect(shown.toString()).not.toMatch(/\bDecisions\b/);
    expect(handed.toString()).toMatch(/continue this work/i);
    expect(handed.toString()).toMatch(/pending tool call|Unresolved/i);
    expect(handed.toString()).not.toMatch(/investigation (is |was )?complete/i);
    expect(handedPi.toString()).toMatch(/for Pi/i);
    expect(handedPi.toString()).toMatch(/continue this work/i);
    expect(handedPi.toString()).toMatch(/pending tool call|Unresolved/i);
    expect(handedPi.toString()).not.toMatch(/\{"type":"session"/);
  });
});
