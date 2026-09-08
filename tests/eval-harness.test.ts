import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

interface EvalMod {
  TASKS: Array<{ id: string; files: string[]; statement: string; verify: string[] }>;
  validateResult: (r: unknown) => { ok: boolean; errors: string[] };
  buildPrompt: (
    task: { id: string; statement: string; details: string; verify: string[]; endState: string },
    condition: string,
    handoff: string | null,
  ) => string;
}

const modUrl = new URL("../scripts/eval-continuation.mjs", import.meta.url).href;
const mod = (await import(modUrl)) as EvalMod;

const SCRIPT = join(import.meta.dirname, "..", "scripts", "eval-continuation.mjs");
const EVAL_BASE = join(tmpdir(), "opencode", "harnie-eval");

const scratch = mkdtempSync(join(tmpdir(), "opencode", "harnie-eval-test-"));
const cleanupDirs: string[] = [];

const runHarness = (args: string[], env: Record<string, string> = {}) => {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  return {
    code: res.status ?? -1,
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
  };
};

const fakeAgentPath = join(scratch, "fake-agent.mjs");
writeFileSync(
  fakeAgentPath,
  [
    'import { writeFileSync, readFileSync } from "node:fs";',
    "const args = process.argv.slice(2);",
    "const get = (k) => args[args.indexOf(k) + 1];",
    'const prompt = readFileSync(get("--prompt-file"), "utf8");',
    'writeFileSync(get("--clone") + "/FAKE-" + get("--mark") + ".txt", "fake edit\\nprompt chars: " + prompt.length + "\\n");',
    'writeFileSync(get("--clone") + "/README.md", readFileSync(get("--clone") + "/README.md", "utf8") + "\\n<!-- fake edit -->\\n");',
    'console.log("fake agent done");',
  ].join("\n"),
);

const agentCommand = (mark: string) =>
  `node ${fakeAgentPath} --mark ${mark} --clone {clone} --prompt-file {prompt_file}`;

const uniqueRun = () => {
  const id = `eval-test-${Date.now()}-${process.pid}-${cleanupDirs.length}`;
  cleanupDirs.push(join(EVAL_BASE, id));
  return id;
};

describe("eval harness — clone preparation", () => {
  it("prepares isolated, deterministic clones outside the working tree", () => {
    const runId = uniqueRun();
    const first = runHarness([
      "prepare",
      "--task",
      "version-flag",
      "--condition",
      "baseline",
      "--run",
      runId,
      "--ref",
      "HEAD",
    ]);
    const second = runHarness([
      "prepare",
      "--task",
      "version-flag",
      "--condition",
      "baseline",
      "--run",
      runId,
      "--ref",
      "HEAD",
    ]);
    expect(first.code).toBe(0);
    expect(second.code).toBe(0);

    const headOf = (out: string) => out.trim().split("head=")[1] ?? "";
    expect(headOf(first.stdout)).toBeTruthy();
    expect(headOf(first.stdout)).toBe(headOf(second.stdout));

    const clone = join(EVAL_BASE, runId, "version-flag", "baseline", "clone");
    expect(existsSync(join(clone, ".git"))).toBe(true);
    expect(existsSync(join(clone, "node_modules"))).toBe(true);
    expect(clone.startsWith(EVAL_BASE)).toBe(true);
    expect(clone.startsWith(process.cwd())).toBe(false);

    const head = headOf(first.stdout);
    const other = runHarness([
      "prepare",
      "--task",
      "shebang-guard",
      "--condition",
      "baseline",
      "--run",
      runId,
    ]);
    expect(other.code).toBe(0);
    const otherClone = join(EVAL_BASE, runId, "shebang-guard", "baseline", "clone");
    expect(otherClone).not.toBe(clone);
    expect(readFileSync(join(EVAL_BASE, runId, "run.json"), "utf8")).toContain("harnie-eval-run/v1");
    expect(head).toBeTruthy();
  });
});

describe("eval harness — mocked agent run", () => {
  it("runs the injected command and records a valid result.json", () => {
    const runId = uniqueRun();
    const res = runHarness(
      [
        "run",
        "--task",
        "version-flag",
        "--condition",
        "baseline",
        "--run",
        runId,
        "--agent-command",
        agentCommand("v1"),
      ],
      { HARNIE_EVAL_AGENT_COMMAND: "" },
    );
    expect(res.code).toBe(0);
    expect(res.stderr).not.toContain("manual");

    const dir = join(EVAL_BASE, runId, "version-flag", "baseline");
    const result = JSON.parse(readFileSync(join(dir, "result.json"), "utf8"));
    expect(result.schema).toBe("harnie-eval-result/v1");
    expect(result.status).toBe("ran");
    expect(result.taskId).toBe("version-flag");
    expect(result.condition).toBe("baseline");
    expect(result.edits.files).toContain("FAKE-v1.txt");
    expect(result.edits.diffChars).toBeGreaterThan(0);
    expect(existsSync(join(dir, "edits.diff"))).toBe(true);
    expect(existsSync(join(dir, "agent-stdout.log"))).toBe(true);
    expect(readFileSync(join(dir, "agent-stdout.log"), "utf8")).toContain("fake agent done");
    expect(result.metrics.repeatedFinishedEdits).toBe("unknown");
    expect(result.metrics.falseCompletion).toBeNull();
    expect(mod.validateResult(result).ok).toBe(true);

    const prompt = readFileSync(join(dir, "prompt.md"), "utf8");
    expect(prompt).toContain(mod.TASKS[0]!.statement);
    expect(prompt).toContain("## Required verification");
  });

  it("does not contaminate tasks run in the same run dir", () => {
    const runId = uniqueRun();
    const a = runHarness([
      "run",
      "--task",
      "version-flag",
      "--condition",
      "baseline",
      "--run",
      runId,
      "--agent-command",
      agentCommand("A"),
    ]);
    const b = runHarness(
      [
        "run",
        "--task",
        "shebang-guard",
        "--condition",
        "baseline",
        "--run",
        runId,
        "--agent-command",
        agentCommand("B"),
      ],
      { HARNIE_EVAL_AGENT_COMMAND: "should-be-ignored" },
    );
    expect(a.code).toBe(0);
    expect(b.code).toBe(0);

    const cloneA = join(EVAL_BASE, runId, "version-flag", "baseline", "clone");
    const cloneB = join(EVAL_BASE, runId, "shebang-guard", "baseline", "clone");
    expect(existsSync(join(cloneA, "FAKE-A.txt"))).toBe(true);
    expect(existsSync(join(cloneA, "FAKE-B.txt"))).toBe(false);
    expect(existsSync(join(cloneB, "FAKE-B.txt"))).toBe(true);
    expect(existsSync(join(cloneB, "FAKE-A.txt"))).toBe(false);

    const resultA = JSON.parse(readFileSync(join(cloneA, "..", "result.json"), "utf8"));
    const resultB = JSON.parse(readFileSync(join(cloneB, "..", "result.json"), "utf8"));
    expect(resultA.taskId).toBe("version-flag");
    expect(resultB.taskId).toBe("shebang-guard");
    expect(resultA.environment.agent).toBe("custom:node");
    expect(resultB.environment.agent).toBe("custom:node");
  });
});

describe("eval harness — manual-run mode", () => {
  it("degrades to instructions + template without any agent", () => {
    const runId = uniqueRun();
    const res = runHarness([
      "run",
      "--task",
      "first-run-recovery",
      "--condition",
      "handoff",
      "--run",
      runId,
    ]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("[manual]");

    const dir = join(EVAL_BASE, runId, "first-run-recovery", "handoff");
    const instructions = readFileSync(join(dir, "manual-instructions.md"), "utf8");
    expect(instructions).toContain("Manual receiver run");
    expect(instructions).toContain("record --dir");
    const template = JSON.parse(readFileSync(join(dir, "result-template.json"), "utf8"));
    expect(template.status).toBe("not-run");
    expect(template.metrics.taskCompleted).toBeNull();

    const result = JSON.parse(readFileSync(join(dir, "result.json"), "utf8"));
    expect(result.status).toBe("manual");
    expect(mod.validateResult(result).ok).toBe(true);
  });

  it("record validates: rejects bad results, accepts filled ones", () => {
    const runId = uniqueRun();
    runHarness(["run", "--task", "first-run-recovery", "--condition", "handoff", "--run", runId]);
    const dir = join(EVAL_BASE, runId, "first-run-recovery", "handoff");

    const badPath = join(scratch, "bad-result.json");
    writeFileSync(
      badPath,
      JSON.stringify({ schema: "wrong", runId, taskId: "first-run-recovery" }),
    );
    const rejected = runHarness(["record", "--dir", dir, "--file", badPath]);
    expect(rejected.code).not.toBe(0);
    expect(rejected.stderr).toContain("schema");

    const good = JSON.parse(readFileSync(join(dir, "result-template.json"), "utf8"));
    good.status = "ran";
    good.recordedAt = new Date().toISOString();
    good.notRunReason = null;
    good.environment.agent = "human";
    good.metrics.taskCompleted = true;
    good.metrics.falseCompletion = false;
    good.metrics.repeatedFinishedEdits = "none";
    const goodPath = join(scratch, "good-result.json");
    writeFileSync(goodPath, JSON.stringify(good));
    const accepted = runHarness(["record", "--dir", dir, "--file", goodPath]);
    expect(accepted.code).toBe(0);
    const registered = JSON.parse(readFileSync(join(dir, "result.json"), "utf8"));
    expect(registered.status).toBe("ran");
    expect(registered.metrics.taskCompleted).toBe(true);
  });
});

describe("eval harness — summarize", () => {
  it("emits a side-by-side summary and preview-gate line", () => {
    const runId = uniqueRun();
    runHarness([
      "run",
      "--task",
      "version-flag",
      "--condition",
      "handoff,baseline",
      "--run",
      runId,
      "--agent-command",
      agentCommand("S"),
    ]);
    const res = runHarness(["summarize", "--run", runId]);
    expect(res.code).toBe(0);
    const runDir = join(EVAL_BASE, runId);
    const summaryMd = readFileSync(join(runDir, "summary.md"), "utf8");
    expect(summaryMd).toContain("version-flag");
    expect(summaryMd).toContain("handoff");
    expect(summaryMd).toContain("baseline");
    expect(summaryMd).toContain("Preview gate");
    const summary = JSON.parse(readFileSync(join(runDir, "summary.json"), "utf8"));
    expect(summary.rows).toHaveLength(mod.TASKS.length * 2);
    const vf = summary.rows.filter((r: { taskId: string }) => r.taskId === "version-flag");
    expect(vf.map((r: { condition: string }) => r.condition)).toEqual(
      expect.arrayContaining(["handoff", "baseline"]),
    );
  });
});

afterAll(() => {
  for (const dir of cleanupDirs) rmSync(dir, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});
