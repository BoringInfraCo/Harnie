import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

interface EvalMod {
  TASKS: Array<{
    id: string;
    files: string[];
    statement: string;
    details: string;
    verify: string[];
    endState: string;
  }>;
  validateResult: (r: unknown) => { ok: boolean; errors: string[] };
  validateResultV1: (r: unknown) => { ok: boolean; errors: string[] };
  validateResultV2: (r: unknown) => { ok: boolean; errors: string[] };
  validateRunV2: (run: unknown, opts?: { now?: number }) => { ok: boolean; errors: string[] };
  generateSummary: (runDir: string, run: unknown) => { data: unknown; md: string };
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

const scratchParent = join(tmpdir(), "opencode");
mkdirSync(scratchParent, { recursive: true });
const scratch = mkdtempSync(join(scratchParent, "harnie-eval-test-"));
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
    'writeFileSync(get("--clone") + "/FAKE-" + get("--mark") + ".txt", "fake edit\\nprompt chars: " + prompt.length + "\\nHARNIE_HOME=" + (process.env.HARNIE_HOME ?? "(unset)") + "\\nPWD=" + process.env.PWD + "\\n");',
    'writeFileSync(get("--clone") + "/README.md", readFileSync(get("--clone") + "/README.md", "utf8") + "\\n<!-- fake edit -->\\n");',
    'console.log("fake agent done");',
  ].join("\n"),
);

const agentCommand = (mark: string) =>
  `node ${fakeAgentPath} --mark ${mark} --clone {clone} --prompt-file {prompt_file}`;

// Run ids must embed the execution timestamp in the canonical
// eval-<YYYYMMDD>T<HHMM>[-suffix] form (UTC) — verify-evidence binds the id
// stamp to the manifest's createdAt within +/-10 min, so test ids follow the
// same convention the harness generates (uniqueness via pid + counter).
const uniqueRun = () => {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 13);
  const id = `eval-${stamp}-t${process.pid}-${cleanupDirs.length}`;
  cleanupDirs.push(join(EVAL_BASE, id));
  return id;
};

describe("eval harness — task registry", () => {
  it("keeps the version-flag expectation candidate-independent", () => {
    const task = mod.TASKS.find(({ id }) => id === "version-flag");
    expect(task).toBeDefined();
    const contract = [...task!.verify, task!.endState].join("\n");
    expect(contract).toContain("package.json");
    expect(contract).not.toContain("0.0.0");
  });
});

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
    expect(readFileSync(join(EVAL_BASE, runId, "run.json"), "utf8")).toContain("harnie-eval-run/v2");
    expect(head).toBeTruthy();
  }, 30000);
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
    expect(result.schema).toBe("harnie-eval-result/v2");
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

    // Directed-matrix provenance fields (2026-09-09).
    expect(result.sourceHarness).toBeNull();
    expect(result.targetHarness).toBe("node");
    expect(result.tagSha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.refName).toBe("HEAD");
    expect(result.handoffArtifactSha).toBeNull();
    const runJson = JSON.parse(readFileSync(join(EVAL_BASE, runId, "run.json"), "utf8"));
    expect(runJson.tagSha).toBe(result.tagSha);
    expect(runJson.refName).toBe("HEAD");
  });

  it("contains receivers: clone cwd, sandboxed HARNIE_HOME, no repo-tree writes", () => {
    const runId = uniqueRun();
    const res = runHarness([
      "run",
      "--task",
      "version-flag",
      "--condition",
      "baseline",
      "--run",
      runId,
      "--agent-command",
      agentCommand("CT"),
    ]);
    expect(res.code).toBe(0);
    const dir = join(EVAL_BASE, runId, "version-flag", "baseline");
    const fake = readFileSync(join(dir, "clone", "FAKE-CT.txt"), "utf8");
    const harnieHome = /HARNIE_HOME=(\S*)/.exec(fake)?.[1] ?? "";
    // HARNIE_HOME must be pinned inside the eval sandbox, never the real home.
    expect(harnieHome).not.toBe("");
    expect(harnieHome.startsWith(EVAL_BASE)).toBe(true);
    expect(harnieHome).not.toContain(".harnie");
    expect(harnieHome).not.toBe(process.env.HARNIE_HOME ?? "");
    // The receiver's PWD must be the clone, not the Harnie working tree.
    const pwd = /PWD=(\S*)/.exec(fake)?.[1] ?? "";
    expect(pwd).toBe(join(dir, "clone"));
    expect(pwd.startsWith(process.cwd())).toBe(false);
  });

  it("records --source-harness/--target-harness provenance (handoff condition only for source)", () => {
    const runId = uniqueRun();
    const handoffFile = join(scratch, "fake-handoff-prov.md");
    writeFileSync(handoffFile, "# provenance test handoff\n");
    const res = runHarness([
      "run",
      "--task",
      "version-flag",
      "--condition",
      "handoff,baseline",
      "--run",
      runId,
      "--agent-command",
      agentCommand("PV"),
      "--source-harness",
      "pi",
      "--handoff",
      handoffFile,
    ]);
    expect(res.code).toBe(0);
    const base = join(EVAL_BASE, runId, "version-flag");
    const handoffResult = JSON.parse(readFileSync(join(base, "handoff", "result.json"), "utf8"));
    const baselineResult = JSON.parse(readFileSync(join(base, "baseline", "result.json"), "utf8"));
    expect(handoffResult.sourceHarness).toBe("pi");
    expect(baselineResult.sourceHarness).toBeNull();
    expect(handoffResult.targetHarness).toBe("node");
    expect(handoffResult.handoffArtifactSha).toBe(handoffResult.handoff.sha256);
    expect(baselineResult.handoffArtifactSha).toBeNull();
    expect(mod.validateResult(handoffResult).ok).toBe(true);
    expect(mod.validateResult(baselineResult).ok).toBe(true);
  });

  it("validates the new provenance fields (missing tagSha / bad sha rejected)", () => {
    const runId = uniqueRun();
    runHarness(["run", "--task", "first-run-recovery", "--condition", "handoff", "--run", runId]);
    const dir = join(EVAL_BASE, runId, "first-run-recovery", "handoff");
    const template = JSON.parse(readFileSync(join(dir, "result-template.json"), "utf8"));

    const noTag = { ...template, status: "ran", recordedAt: new Date().toISOString(), tagSha: undefined };
    const noTagPath = join(scratch, "no-tag.json");
    writeFileSync(noTagPath, JSON.stringify(noTag));
    const rejected = runHarness(["record", "--dir", dir, "--file", noTagPath]);
    expect(rejected.code).not.toBe(0);
    expect(rejected.stderr).toContain("tagSha");

    const badSha = { ...template, status: "ran", recordedAt: new Date().toISOString(), handoffArtifactSha: "nothex" };
    const badShaPath = join(scratch, "bad-sha.json");
    writeFileSync(badShaPath, JSON.stringify(badSha));
    const rejectedSha = runHarness(["record", "--dir", dir, "--file", badShaPath]);
    expect(rejectedSha.code).not.toBe(0);
    expect(rejectedSha.stderr).toContain("handoffArtifactSha");
  });

  it("--patch applies the driver pre-state as a commit (continuation semantics)", async () => {
    const runId = uniqueRun();
    // New-file patch: applies cleanly against any checkout.
    const patchPath = join(scratch, "driver-steps.patch");
    writeFileSync(
      patchPath,
      [
        "diff --git a/DRIVER-STEPS.md b/DRIVER-STEPS.md",
        "new file mode 100644",
        "index 0000000..d6b4a90",
        "--- /dev/null",
        "+++ b/DRIVER-STEPS.md",
        "@@ -0,0 +1 @@",
        "+driver steps 1-2 pre-applied",
      ].join("\n") + "\n",
    );
    const res = runHarness([
      "run",
      "--task",
      "greeting-command",
      "--condition",
      "baseline",
      "--run",
      runId,
      "--agent-command",
      agentCommand("PT"),
      "--patch",
      patchPath,
    ]);
    expect(res.code).toBe(0);
    const dir = join(EVAL_BASE, runId, "greeting-command", "baseline");
    const clone = join(dir, "clone");
    expect(existsSync(join(clone, "DRIVER-STEPS.md"))).toBe(true);
    // Pre-state is committed: the receiver's own edit list must not include it.
    const { execFileSync } = await import("node:child_process");
    const status = execFileSync("git", ["-C", clone, "status", "--porcelain"], { encoding: "utf8" });
    expect(status).not.toContain("DRIVER-STEPS.md");
    const result = JSON.parse(readFileSync(join(dir, "result.json"), "utf8"));
    expect(result.patch).toEqual({
      path: expect.any(String),
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      committed: true,
    });
    expect(result.patch.path).not.toMatch(/^\//);
    expect(resolve(dir, result.patch.path)).toBe(patchPath);
    expect(result.edits.files).not.toContain("DRIVER-STEPS.md");
    expect(mod.validateResult(result).ok).toBe(true);
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
    expect(instructions).toContain("sourceHarness");
    const template = JSON.parse(readFileSync(join(dir, "result-template.json"), "utf8"));
    expect(template.status).toBe("not-run");
    expect(template.metrics.taskCompleted).toBeNull();

    const result = JSON.parse(readFileSync(join(dir, "result.json"), "utf8"));
    expect(result.status).toBe("manual");
    // A handoff-condition skeleton with NO declared driver/artifact provenance
    // is rejected by design (strict v2 condition invariants).
    const v = mod.validateResult(result);
    expect(v.ok).toBe(false);
    expect(v.errors.join("\n")).toContain('condition "handoff" requires a non-empty sourceHarness');
  });

  it("record validates: rejects bad results, accepts filled ones", () => {
    const runId = uniqueRun();
    const handoffFile = join(scratch, "fake-handoff-manual-rec.md");
    writeFileSync(handoffFile, "# manual record test handoff\n");
    runHarness([
      "run",
      "--task",
      "first-run-recovery",
      "--condition",
      "handoff",
      "--run",
      runId,
      "--handoff",
      handoffFile,
      "--source-harness",
      "pi",
    ]);
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
    good.execution = {
      invocation: ["manual-run", "opencode", "run", "--auto", "$(cat prompt.md)"],
      exitCode: 0,
      signal: null,
      timedOut: false,
      wallMs: 1000,
      stdoutLog: "agent-stdout.log",
      stderrLog: "agent-stderr.log",
    };
    // Release-qualifying (ran + handoff): pin the generating provenance to the
    // evaluated candidate.
    const runJson = JSON.parse(readFileSync(join(EVAL_BASE, runId, "run.json"), "utf8"));
    good.handoffGeneratedByRef = runJson.refName;
    good.handoffGeneratedBySha = runJson.tagSha;
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

describe("eval harness — handoff/baseline isolation", () => {
  it("baseline runs never inherit the handoff artifact (path, size, prompt)", () => {
    const runId = uniqueRun();
    const handoffFile = join(scratch, "fake-handoff.md");
    const handoffMarker = "PRIOR-SESSION-CONTEXT-MARKER-42";
    writeFileSync(handoffFile, `# fake handoff\n\n${handoffMarker}\n`);
    const res = runHarness([
      "run",
      "--task",
      "version-flag",
      "--condition",
      "handoff,baseline",
      "--run",
      runId,
      "--agent-command",
      agentCommand("HB"),
      "--handoff",
      handoffFile,
    ]);
    expect(res.code).toBe(0);

    const base = join(EVAL_BASE, runId, "version-flag");
    const handoffResult = JSON.parse(readFileSync(join(base, "handoff", "result.json"), "utf8"));
    const baselineResult = JSON.parse(readFileSync(join(base, "baseline", "result.json"), "utf8"));

    // Path convention: handoff.path is relative to the result dir and resolves.
    expect(handoffResult.handoff.path).not.toMatch(/^\//);
    expect(resolve(join(base, "handoff"), handoffResult.handoff.path)).toBe(handoffFile);
    expect(handoffResult.handoff.chars).toBeGreaterThan(0);
    expect(handoffResult.handoff.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(join(base, "handoff", "prompt.md"), "utf8")).toContain(handoffMarker);

    expect(baselineResult.handoff).toEqual({ path: null, chars: null, sha256: null });
    const baselinePrompt = readFileSync(join(base, "baseline", "prompt.md"), "utf8");
    expect(baselinePrompt).not.toContain(handoffMarker);
    expect(mod.validateResult(baselineResult).ok).toBe(true);

    const summary = runHarness(["summarize", "--run", runId]);
    expect(summary.code).toBe(0);
    const summaryJson = JSON.parse(readFileSync(join(EVAL_BASE, runId, "summary.json"), "utf8"));
    const rows = summaryJson.rows.filter((r: { taskId: string }) => r.taskId === "version-flag");
    const handoffRow = rows.find((r: { condition: string }) => r.condition === "handoff");
    const baselineRow = rows.find((r: { condition: string }) => r.condition === "baseline");
    expect(handoffRow.packageSizeChars).toBe(handoffResult.handoff.chars);
    expect(baselineRow.packageSizeChars).toBeNull();
    const summaryMd = readFileSync(join(EVAL_BASE, runId, "summary.md"), "utf8");
    const baselineLine = summaryMd
      .split("\n")
      .find((l) => l.startsWith(`| version-flag | baseline |`));
    expect(baselineLine).toContain("N/A");
    expect(baselineLine).not.toContain(String(handoffResult.handoff.chars));
  });
  it("manual-run mode also isolates baseline from the handoff artifact", () => {
    const runId = uniqueRun();
    const handoffFile = join(scratch, "fake-handoff-manual.md");
    writeFileSync(handoffFile, "# fake handoff for manual mode\n");
    const res = runHarness([
      "run",
      "--task",
      "first-run-recovery",
      "--condition",
      "handoff,baseline",
      "--run",
      runId,
      "--handoff",
      handoffFile,
      "--source-harness",
      "pi",
    ]);
    expect(res.code).toBe(0);

    const base = join(EVAL_BASE, runId, "first-run-recovery");
    const handoffResult = JSON.parse(readFileSync(join(base, "handoff", "result.json"), "utf8"));
    const baselineResult = JSON.parse(readFileSync(join(base, "baseline", "result.json"), "utf8"));
    expect(handoffResult.handoff.path).not.toMatch(/^\//);
    expect(resolve(join(base, "handoff"), handoffResult.handoff.path)).toBe(handoffFile);
    // the ready artifact is measured into the skeleton at prep time
    expect(handoffResult.handoff.chars).toBeGreaterThan(0);
    expect(handoffResult.handoff.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(handoffResult.handoffArtifactSha).toBe(handoffResult.handoff.sha256);
    expect(baselineResult.handoff).toEqual({ path: null, chars: null, sha256: null });
    expect(mod.validateResult(baselineResult).ok).toBe(true);
    expect(mod.validateResult(handoffResult).ok).toBe(true);
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

describe("eval harness — schema versioning (v1 archived / v2 current)", () => {
  it("validates an archived v1 result file from eval-2026-09-07 with the retained v1 validator", () => {
    const archivedPath = join(
      import.meta.dirname,
      "..",
      "docs",
      "research",
      "eval-2026-09-07",
      "runs",
      "eval-20260907T2041",
      "version-flag",
      "handoff",
      "result.json",
    );
    expect(existsSync(archivedPath)).toBe(true);
    const archived = JSON.parse(readFileSync(archivedPath, "utf8"));
    expect(archived.schema).toBe("harnie-eval-result/v1");
    expect(archived.tagSha).toBeUndefined();
    expect(archived.sourceHarness).toBeUndefined();
    // Retained v1 validator accepts the archived record as-is.
    expect(mod.validateResultV1(archived).ok).toBe(true);
    // Dispatch on the declared schema field routes it to v1.
    expect(mod.validateResult(archived).ok).toBe(true);
    // v2 requirements correctly reject it (provenance fields absent).
    expect(mod.validateResultV2(archived).ok).toBe(false);
  });
});

describe("eval harness — v2 invariants (condition, provenance, nested fields)", () => {
  // A fully valid v2 record (mirrors what the harness emits and what the
  // curated eval-2026-09-09 / eval-2026-09-09b records carry).
  const makeV2 = (overrides: Record<string, unknown> = {}) => ({
    schema: "harnie-eval-result/v2",
    runId: "eval-x",
    taskId: "version-flag",
    condition: "baseline",
    status: "ran",
    notRunReason: null,
    sourceHarness: null,
    targetHarness: "opencode",
    tagSha: "a".repeat(40),
    refName: "v0.1.0-rc.3",
    handoffArtifactSha: null,
    patch: null,
    recordedAt: "2026-09-09T01:43:41.787Z",
    environment: {
      agent: "opencode",
      agentVersion: "1.18.29",
      model: "opencode-go/kimi-k2.7-code",
      node: "v22.23.0",
      platform: "darwin",
      ref: "a".repeat(40),
      clonePath: "disposable:version-flag/baseline/clone",
    },
    handoff: { path: null, chars: null, sha256: null },
    execution: {
      invocation: ["opencode", "run", "--auto", "prompt"],
      exitCode: 0,
      signal: null,
      timedOut: false,
      wallMs: 33271,
      stdoutLog: "agent-stdout.log",
      stderrLog: "agent-stderr.log",
    },
    commandsRun: [{ cmd: "npm run build", purpose: "receiver verification" }],
    edits: { files: ["src/cli.ts"], outOfScopeFiles: [], diffChars: 100, diffPath: "edits.diff" },
    verification: { ran: true, commands: ["npm run build"], passed: true, details: "ok" },
    metrics: {
      developerReExplanation: "unknown",
      repeatedInvestigation: "unknown",
      repeatedFinishedEdits: "unknown",
      nextActionCorrect: "unknown",
      missingOrFalseContext: "unknown",
      taskCompleted: null,
      falseCompletion: null,
      packageSizeChars: null,
    },
    notes: null,
    ...overrides,
  });

  it("accepts a fully valid baseline and handoff record", () => {
    expect(mod.validateResult(makeV2()).ok).toBe(true);
    expect(
      mod.validateResult(
        makeV2({
          condition: "handoff",
          sourceHarness: "codex",
          handoffArtifactSha: "b".repeat(64),
          // release-qualifying: the generating provenance must be pinned to
          // the evaluated candidate (status "ran" + condition "handoff").
          handoffGeneratedByRef: "v0.1.0-rc.3",
          handoffGeneratedBySha: "a".repeat(40),
          handoff: { path: "../../driver/h.md", chars: 1907, sha256: "b".repeat(64) },
          metrics: {
            developerReExplanation: "unknown",
            repeatedInvestigation: "unknown",
            repeatedFinishedEdits: "unknown",
            nextActionCorrect: "unknown",
            missingOrFalseContext: "unknown",
            taskCompleted: null,
            falseCompletion: null,
            packageSizeChars: 1907,
          },
        }),
      ).ok,
    ).toBe(true);
  });

  it("validates the paired handoffGeneratedBy provenance fields when present", () => {
    // Canonical form: 40-hex git commit sha of the generating ref, equal to
    // the evaluated tagSha for a release-qualifying record.
    const withGen = (o: Record<string, unknown>) => makeV2({ condition: "handoff", sourceHarness: "codex", handoffArtifactSha: "b".repeat(64), handoff: { path: "h.md", chars: 10, sha256: "b".repeat(64) }, ...o });
    expect(mod.validateResultV2(withGen({ handoffGeneratedByRef: "v0.1.0-rc.2", handoffGeneratedBySha: "a".repeat(40) })).ok).toBe(true);
    // Explicit nulls (generating ref equals the candidate / unknown) stay
    // valid — but only for NON-qualifying records: a status "ran" + "handoff"
    // record must pin the generating sha to tagSha (tested below).
    const notQualifying = (o: Record<string, unknown>) =>
      withGen({ status: "not-run", notRunReason: "provider unfunded (402)", ...o });
    expect(mod.validateResultV2(notQualifying({ handoffGeneratedByRef: null, handoffGeneratedBySha: null })).ok).toBe(true);
    // The 64-hex sha256 form is only valid for NON-qualifying records
    // (status "ran" + "handoff" pins the generating sha to tagSha).
    expect(mod.validateResultV2(notQualifying({ handoffGeneratedByRef: "v0.1.0-rc.2", handoffGeneratedBySha: "c".repeat(64) })).ok).toBe(true);
    // Non-hex or short shas are rejected.
    const badSha = withGen({ handoffGeneratedByRef: "v0.1.0-rc.2", handoffGeneratedBySha: "nothex" });
    expect(mod.validateResultV2(badSha).ok).toBe(false);
    expect(mod.validateResultV2(badSha).errors.join("\n")).toContain("handoffGeneratedBySha");
    const shortSha = withGen({ handoffGeneratedBySha: "c".repeat(39) });
    expect(mod.validateResultV2(shortSha).ok).toBe(false);
    // Empty ref strings are rejected.
    expect(mod.validateResultV2(withGen({ handoffGeneratedByRef: "" })).ok).toBe(false);
    // PAIRING (2026-09-10 re-audit P2 closure): a half-filled pair is rejected.
    const refOnly = withGen({ handoffGeneratedByRef: "v0.1.0-rc.2", handoffGeneratedBySha: null });
    expect(mod.validateResultV2(refOnly).ok).toBe(false);
    expect(mod.validateResultV2(refOnly).errors.join("\n")).toContain("must be paired");
    const shaOnly = withGen({ handoffGeneratedByRef: null, handoffGeneratedBySha: "c".repeat(40) });
    expect(mod.validateResultV2(shaOnly).ok).toBe(false);
    expect(mod.validateResultV2(shaOnly).errors.join("\n")).toContain("must be paired");
    // RELEASE-QUALIFYING RECORDS (status "ran" + condition "handoff") must pin
    // the generating sha to the evaluated tagSha; older artifacts are allowed
    // only for non-qualifying records.
    const staleArtifact = withGen({ handoffGeneratedByRef: "v0.1.0-rc.2", handoffGeneratedBySha: "c".repeat(40) });
    expect(mod.validateResultV2(staleArtifact).ok).toBe(false);
    expect(mod.validateResultV2(staleArtifact).errors.join("\n")).toContain("must equal tagSha");
    const missingProvenance = withGen({});
    expect(mod.validateResultV2(missingProvenance).ok).toBe(false);
    expect(mod.validateResultV2(missingProvenance).errors.join("\n")).toContain("requires handoffGeneratedBySha === tagSha");
    // The stale artifact IS registrable once the record is non-qualifying.
    expect(
      mod.validateResultV2(notQualifying({ handoff: { path: "h.md", chars: 10, sha256: "b".repeat(64) }, handoffGeneratedByRef: "v0.1.0-rc.2", handoffGeneratedBySha: "c".repeat(40) })).ok,
    ).toBe(true);
    // A baseline has no handoff artifact, so it cannot name a generating ref.
    const baselineGen = makeV2({ handoffGeneratedByRef: "v0.1.0-rc.2", handoffGeneratedBySha: "c".repeat(40) });
    expect(mod.validateResultV2(baselineGen).ok).toBe(false);
    expect(mod.validateResultV2(baselineGen).errors.join("\n")).toContain('condition "baseline" requires handoffGeneratedBySha null');
  });

  it("requires environment.ref to be a 40-hex commit sha in v2 records", () => {
    // 2026-09-10 re-audit P2 closure: `environment.ref: null` used to pass.
    const nullRef = makeV2({ environment: { ...makeV2().environment, ref: null } });
    expect(mod.validateResultV2(nullRef).ok).toBe(false);
    const errs = mod.validateResultV2(nullRef).errors.join("\n");
    expect(errs).toContain("environment.ref must be a non-null string");
    expect(errs).toContain("environment.ref must be a 40-hex commit sha");
    // A missing environment.ref key fails too.
    const missing = makeV2();
    delete (missing.environment as Record<string, unknown>).ref;
    expect(mod.validateResultV2(missing).ok).toBe(false);
    expect(mod.validateResultV2(missing).errors.join("\n")).toContain("environment.ref must be present");
    // A non-40-hex value fails.
    const shortRef = makeV2({ environment: { ...makeV2().environment, ref: "0231dd7" } });
    expect(mod.validateResultV2(shortRef).ok).toBe(false);
    expect(mod.validateResultV2(shortRef).errors.join("\n")).toContain("must be a 40-hex commit sha");
  });

  it("rejects the OLD malformed baseline shape (non-null sourceHarness on baseline)", () => {
    // Historical probe: the pre-fix eval-2026-09-10 pi-blocked baseline records
    // carried sourceHarness "opencode"/"codex" on condition "baseline".
    const old = makeV2({ condition: "baseline", sourceHarness: "opencode", targetHarness: "pi" });
    expect(mod.validateResultV2(old).ok).toBe(false);
    expect(mod.validateResultV2(old).errors.join("\n")).toContain('condition "baseline" requires sourceHarness null');
    expect(mod.validateResult(old).ok).toBe(false);
  });

  it("rejects baseline records with any handoff-related value set", () => {
    expect(mod.validateResultV2(makeV2({ handoffArtifactSha: "b".repeat(64) })).ok).toBe(false);
    expect(
      mod.validateResultV2(makeV2({ handoff: { path: "h.md", chars: null, sha256: null } })).ok,
    ).toBe(false);
    expect(
      mod.validateResultV2(makeV2({ handoff: { path: null, chars: 10, sha256: null } })).ok,
    ).toBe(false);
    expect(
      mod.validateResultV2(makeV2({ handoff: { path: null, chars: null, sha256: "b".repeat(64) } })).ok,
    ).toBe(false);
  });

  it("rejects handoff records with missing or contradictory provenance", () => {
    const handoff = (o: Record<string, unknown>) => makeV2({ condition: "handoff", ...o });
    expect(mod.validateResultV2(handoff({ sourceHarness: null, handoffArtifactSha: "b".repeat(64), handoff: { path: "h.md", chars: 10, sha256: "b".repeat(64) } })).ok).toBe(false);
    expect(mod.validateResultV2(handoff({ sourceHarness: "codex", handoffArtifactSha: null, handoff: { path: "h.md", chars: 10, sha256: null } })).ok).toBe(false);
    expect(mod.validateResultV2(handoff({ sourceHarness: "codex", handoffArtifactSha: "nothex", handoff: { path: "h.md", chars: 10, sha256: "nothex" } })).ok).toBe(false);
    expect(mod.validateResultV2(handoff({ sourceHarness: "codex", handoffArtifactSha: "b".repeat(64), handoff: { path: null, chars: 10, sha256: "b".repeat(64) } })).ok).toBe(false);
    expect(mod.validateResultV2(handoff({ sourceHarness: "codex", handoffArtifactSha: "b".repeat(64), handoff: { path: "h.md", chars: null, sha256: "b".repeat(64) } })).ok).toBe(false);
    // recorded hash must match the referenced artifact's recorded sha
    const mismatch = handoff({
      sourceHarness: "codex",
      handoffArtifactSha: "b".repeat(64),
      handoff: { path: "h.md", chars: 10, sha256: "c".repeat(64) },
    });
    expect(mod.validateResultV2(mismatch).ok).toBe(false);
    expect(mod.validateResultV2(mismatch).errors.join("\n")).toContain("must equal handoffArtifactSha");
  });

  it('rejects status "not-run" without a non-empty notRunReason', () => {
    expect(mod.validateResultV2(makeV2({ status: "not-run", notRunReason: null })).ok).toBe(false);
    expect(mod.validateResultV2(makeV2({ status: "not-run", notRunReason: "" })).ok).toBe(false);
    expect(mod.validateResultV2(makeV2({ status: "not-run", notRunReason: "provider unfunded (402)" })).ok).toBe(true);
  });

  it('rejects status "ran" with empty or missing execution fields', () => {
    const noInvocation = makeV2({ execution: { invocation: [], exitCode: 0, signal: null, timedOut: false, wallMs: 1, stdoutLog: "o.log", stderrLog: "e.log" } });
    expect(mod.validateResultV2(noInvocation).ok).toBe(false);
    expect(mod.validateResultV2(noInvocation).errors.join("\n")).toContain('status "ran" requires execution.invocation');
    const noLogs = makeV2({ execution: { invocation: ["x"], exitCode: 0, signal: null, timedOut: false, wallMs: 1, stdoutLog: null, stderrLog: null } });
    expect(mod.validateResultV2(noLogs).ok).toBe(false);
    const noExit = makeV2({ execution: { invocation: ["x"], exitCode: null, signal: null, timedOut: false, wallMs: 1, stdoutLog: "o.log", stderrLog: "e.log" } });
    expect(mod.validateResultV2(noExit).ok).toBe(false);
    // a killed run exits via signal/timedOut instead of an exit code
    expect(
      mod.validateResultV2(makeV2({ execution: { invocation: ["x"], exitCode: null, signal: "SIGTERM", timedOut: true, wallMs: 1, stdoutLog: "o.log", stderrLog: "e.log" } })).ok,
    ).toBe(true);
  });

  it("rejects v2 records missing any documented nested field (unknowns must be explicit nulls)", () => {
    const missingEnv = makeV2();
    delete (missingEnv.environment as Record<string, unknown>).node;
    expect(mod.validateResultV2(missingEnv).ok).toBe(false);
    expect(mod.validateResultV2(missingEnv).errors.join("\n")).toContain("environment.node must be present");

    const missingVerif = makeV2();
    delete (missingVerif.verification as Record<string, unknown>).passed;
    expect(mod.validateResultV2(missingVerif).ok).toBe(false);

    const missingEdits = makeV2();
    delete (missingEdits.edits as Record<string, unknown>).outOfScopeFiles;
    expect(mod.validateResultV2(missingEdits).ok).toBe(false);

    const wrongType = makeV2({ handoff: { path: null, chars: "1907", sha256: null } });
    expect(mod.validateResultV2(wrongType).ok).toBe(false);
    expect(mod.validateResultV2(wrongType).errors.join("\n")).toContain("handoff.chars must be a number or null");

    // explicit nulls for unknown evidence stay valid
    expect(mod.validateResultV2(makeV2({ verification: { ran: null, commands: [], passed: null, details: null } })).ok).toBe(true);
  });

  it("v1 stays tolerant of archived shapes; unknown schemas are rejected", () => {
    const v1: Record<string, unknown> = { ...makeV2(), schema: "harnie-eval-result/v1" };
    delete v1.sourceHarness;
    delete v1.tagSha;
    v1.environment = { agent: "opencode" };
    v1.edits = { files: [] };
    // v1 does not enforce the nested spec or provenance.
    expect(mod.validateResultV1(v1).ok).toBe(true);
    expect(mod.validateResult({ ...makeV2(), schema: "harnie-eval-result/v3" }).ok).toBe(false);
  });
});

describe("eval harness — verify-evidence integrity check", () => {
  // Builds a curated eval-dir fixture from a real harness run (baseline +
  // handoff with a driver artifact), then returns its root path.
  // sourceRunId re-curates an EXISTING run (e.g. one --attest'd earlier).
  const makeFixture = (handoffFile: string, sourceRunId?: string) => {
    const runId = sourceRunId ?? uniqueRun();
    const res = runHarness([
      "run",
      "--task",
      "version-flag",
      "--condition",
      "handoff,baseline",
      "--run",
      runId,
      "--agent-command",
      agentCommand("VE"),
      "--handoff",
      handoffFile,
      "--source-harness",
      "pi",
    ]);
    expect(res.code).toBe(0);
    const srcRun = join(EVAL_BASE, runId);
    const fixtureRoot = join(scratch, `ve-fixture-${cleanupDirs.length}`);
    const runsDir = join(fixtureRoot, "runs", runId);
    mkdirSync(join(fixtureRoot, "driver"), { recursive: true });
    mkdirSync(runsDir, { recursive: true });
    cpSync(join(srcRun, "run.json"), join(runsDir, "run.json"));
    for (const cond of ["handoff", "baseline"]) {
      const condDir = join(runsDir, "version-flag", cond);
      cpSync(join(srcRun, "version-flag", cond), condDir, { recursive: true });
      rmSync(join(condDir, "clone"), { recursive: true, force: true });
      // The fake-agent invocation embeds machine-local /var/folders paths;
      // apply the same curation the real flow uses (binary/script names only).
      const rp = join(condDir, "result.json");
      const rec = JSON.parse(readFileSync(rp, "utf8"));
      rec.execution.invocation = rec.execution.invocation.map((a: string) =>
        typeof a === "string" && a.startsWith("/") ? basename(a) : a,
      );
      writeFileSync(rp, JSON.stringify(rec, null, 2) + "\n");
    }
    // Move the handoff artifact into the fixture's driver/ dir and re-point
    // the record at it with a fixture-relative path (the recorded relative
    // path resolves against the original EVAL_ROOT, not the fixture).
    const runJson = JSON.parse(readFileSync(join(runsDir, "run.json"), "utf8"));
    const driverCopy = join(fixtureRoot, "driver", "fake-handoff-ve.md");
    cpSync(handoffFile, driverCopy);
    const handoffResultPath = join(runsDir, "version-flag", "handoff", "result.json");
    const handoffResult = JSON.parse(readFileSync(handoffResultPath, "utf8"));
    handoffResult.handoff.path = relative(join(runsDir, "version-flag", "handoff"), driverCopy);
    // Release-qualifying provenance (2026-09-10 re-audit P2 closure): a
    // status:"ran" + condition:"handoff" record must pin handoffGeneratedBySha
    // to the evaluated tagSha; the fixture declares the candidate as the
    // generating ref (its 40-hex sha is resolvable in any repo holding it).
    handoffResult.handoffGeneratedByRef = runJson.tagSha;
    handoffResult.handoffGeneratedBySha = runJson.tagSha;
    handoffResult.notes = `${handoffResult.notes ? `${handoffResult.notes} ` : ""}handoffGeneratedBy provenance (fixture): the artifact is declared as generated by the evaluated candidate (${runJson.refName} / ${runJson.tagSha.slice(0, 12)}).`;
    writeFileSync(handoffResultPath, JSON.stringify(handoffResult, null, 2) + "\n");
    // The committed per-run summary must be the canonical regeneration (the
    // drift check compares it against one); build it with the shared code path.
    const { data, md } = mod.generateSummary(runsDir, runJson);
    writeFileSync(join(runsDir, "summary.md"), md);
    writeFileSync(join(runsDir, "summary.json"), JSON.stringify(data, null, 2) + "\n");
    // The eval-root README must claim every manifest's createdAt UTC date
    // (README/manifest date agreement is enforced by verify-evidence). Claim
    // both the manifest date and today so the fixture cannot straddle a UTC
    // midnight boundary flakily.
    const createdDate = new Date(Date.parse(runJson.createdAt)).toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    const dates = [...new Set([createdDate, today])].sort().join(" and ");
    writeFileSync(join(fixtureRoot, "README.md"), `# fixture eval\n\nExecuted ${dates}; run manifest createdAt ${createdDate}.\n`);
    writeFileSync(join(fixtureRoot, "summary.md"), "# fixture eval summary\n");
    return fixtureRoot;
  };

  const handoffSource = join(scratch, "fake-handoff-ve-src.md");
  writeFileSync(handoffSource, "# integrity-check fixture handoff\n");

  const soleRunDir = (fixture: string) => {
    const runsDir = join(fixture, "runs");
    const entries = readdirSync(runsDir).filter((name) =>
      existsSync(join(runsDir, name, "run.json")),
    );
    expect(entries).toHaveLength(1);
    return join(runsDir, entries[0]!);
  };

  it("passes a well-formed curated eval dir", () => {
    const fixture = makeFixture(handoffSource);
    const res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.stdout).toContain("verify-evidence: OK");
    expect(res.code).toBe(0);
  });

  it("flags missing referenced files, local absolute paths, sha mismatches, and missing summaries", () => {
    // (1) a referenced file does not resolve
    let fixture = makeFixture(handoffSource);
    const baselineDir = join(soleRunDir(fixture), "version-flag", "baseline");
    const baselineResult = JSON.parse(readFileSync(join(baselineDir, "result.json"), "utf8"));
    rmSync(join(baselineDir, baselineResult.execution.stdoutLog));
    let res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("does not resolve");

    // (2) machine-local absolute path in a record
    fixture = makeFixture(handoffSource);
    const resultPath = join(soleRunDir(fixture), "version-flag", "baseline", "result.json");
    const withLocal = JSON.parse(readFileSync(resultPath, "utf8"));
    withLocal.environment.clonePath = "/Users/someone/clone";
    writeFileSync(resultPath, JSON.stringify(withLocal));
    res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("machine-local path");

    // (3) handoff artifact content no longer matches the recorded sha256
    fixture = makeFixture(handoffSource);
    const driverCopy = join(fixture, "driver", "fake-handoff-ve.md");
    writeFileSync(driverCopy, readFileSync(driverCopy, "utf8") + "\ntampered\n");
    res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("handoff.sha256 mismatch");

    // (4) a run dir without summary.md
    fixture = makeFixture(handoffSource);
    rmSync(join(soleRunDir(fixture), "summary.md"));
    res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("missing summary.md");

    // (5) unknown schema field on a result record
    fixture = makeFixture(handoffSource);
    const rp = join(soleRunDir(fixture), "version-flag", "baseline", "result.json");
    const badSchema = JSON.parse(readFileSync(rp, "utf8"));
    badSchema.schema = "harnie-eval-result/v9";
    writeFileSync(rp, JSON.stringify(badSchema));
    res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("schema must be");
  }, 30000);

  it("rejects the OLD malformed baseline shape through verify-evidence", () => {
    const fixture = makeFixture(handoffSource);
    const rp = join(soleRunDir(fixture), "version-flag", "baseline", "result.json");
    const rec = JSON.parse(readFileSync(rp, "utf8"));
    rec.sourceHarness = "opencode"; // baseline must have null
    writeFileSync(rp, JSON.stringify(rec));
    const res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain('condition "baseline" requires sourceHarness null');
  }, 30000);

  it("rejects future-dated recordedAt (hand-authored dates)", () => {
    const fixture = makeFixture(handoffSource);
    const rp = join(soleRunDir(fixture), "version-flag", "baseline", "result.json");
    const rec = JSON.parse(readFileSync(rp, "utf8"));
    rec.recordedAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    writeFileSync(rp, JSON.stringify(rec));
    const res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("future-dated");
  }, 30000);

  it("rejects recordedAt more than 1h off the run manifest (either direction)", () => {
    // future relative to the run manifest createdAt
    let fixture = makeFixture(handoffSource);
    let runDir = soleRunDir(fixture);
    let rp = join(runDir, "version-flag", "baseline", "result.json");
    let rec = JSON.parse(readFileSync(rp, "utf8"));
    const runJson = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
    rec.recordedAt = new Date(Date.parse(runJson.createdAt) + 3 * 3600 * 1000).toISOString();
    writeFileSync(rp, JSON.stringify(rec));
    let res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("future-dated relative to the manifest");

    // predating the run manifest createdAt
    fixture = makeFixture(handoffSource);
    runDir = soleRunDir(fixture);
    rp = join(runDir, "version-flag", "baseline", "result.json");
    rec = JSON.parse(readFileSync(rp, "utf8"));
    const runJson2 = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
    rec.recordedAt = new Date(Date.parse(runJson2.createdAt) - 3 * 3600 * 1000).toISOString();
    writeFileSync(rp, JSON.stringify(rec));
    res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("predates the run manifest");
  }, 60000);

  it("rejects a run manifest whose createdAt is more than 1h after the newest file mtime", () => {
    const fixture = makeFixture(handoffSource);
    const runDir = soleRunDir(fixture);
    const rjp = join(runDir, "run.json");
    const runJson = JSON.parse(readFileSync(rjp, "utf8"));
    runJson.createdAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    writeFileSync(rjp, JSON.stringify(runJson));
    const res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("run.json: createdAt");
    expect(res.stderr).toContain("hand-authored date");
  }, 30000);

  // Exact candidate binding (2026-09-10 re-audit P2): the git re-resolution
  // tests run against a throwaway repo (never the working repo) passed via
  // --repo, so the check is hermetic and deterministic. The repo has an OLDER
  // commit/tag and a CANDIDATE commit/tag: an artifact "generated" by the
  // older build is valid provenance only for non-qualifying records.
  const makeHermeticRepo = () => {
    const repoDir = join(scratch, `binding-repo-${cleanupDirs.length}`);
    execFileSync("git", ["init", "-q", repoDir]);
    const g = (args: string[]) =>
      execFileSync("git", ["-C", repoDir, "-c", "user.name=t", "-c", "user.email=t@example.test", ...args], {
        encoding: "utf8",
      });
    writeFileSync(join(repoDir, "f.txt"), "older commit\n");
    g(["add", "-A"]);
    g(["commit", "-q", "-m", "older"]);
    const shaOld = g(["rev-parse", "HEAD"]).trim();
    writeFileSync(join(repoDir, "f.txt"), "candidate commit\n");
    g(["add", "-A"]);
    g(["commit", "-q", "-m", "candidate"]);
    const shaCand = g(["rev-parse", "HEAD"]).trim();
    // tag the OLDER commit and the CANDIDATE commit (not HEAD)
    g(["tag", "older", shaOld]);
    g(["tag", "candidate", shaCand]);
    return { repoDir, shaOld, shaCand };
  };

  const rebind = (runDir: string, refName: string, tagSha: string) => {
    const rjp = join(runDir, "run.json");
    const runJson = JSON.parse(readFileSync(rjp, "utf8"));
    runJson.refName = refName;
    runJson.ref = tagSha;
    runJson.tagSha = tagSha;
    writeFileSync(rjp, JSON.stringify(runJson, null, 2) + "\n");
    for (const cond of ["handoff", "baseline"]) {
      const rp = join(runDir, "version-flag", cond, "result.json");
      const rec = JSON.parse(readFileSync(rp, "utf8"));
      rec.refName = refName;
      rec.tagSha = tagSha;
      rec.environment.ref = tagSha;
      // keep the release-qualifying provenance pinned to the rebound candidate
      if (cond === "handoff") {
        rec.handoffGeneratedByRef = tagSha;
        rec.handoffGeneratedBySha = tagSha;
      }
      writeFileSync(rp, JSON.stringify(rec, null, 2) + "\n");
    }
    // keep the committed summary consistent with the rebound records
    const { data, md } = mod.generateSummary(runDir, runJson);
    writeFileSync(join(runDir, "summary.json"), JSON.stringify(data, null, 2) + "\n");
    writeFileSync(join(runDir, "summary.md"), md);
  };

  it("re-resolves a tag refName in git and rejects a tagSha binding mismatch (--repo)", () => {
    const { repoDir, shaCand, shaOld } = makeHermeticRepo();
    const fixture = makeFixture(handoffSource);
    const runDir = soleRunDir(fixture);
    rebind(runDir, "candidate", shaOld);
    const res = runHarness(["verify-evidence", "--dir", fixture, "--repo", repoDir]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("exact candidate binding mismatch");
    expect(res.stderr).toContain("candidate");
    expect(shaCand).toMatch(/^[0-9a-f]{40}$/);
  }, 30000);

  it("accepts a consistent tag binding (--repo) and warns on an unresolvable ref instead of passing silently", () => {
    const { repoDir, shaCand } = makeHermeticRepo();
    const fixture = makeFixture(handoffSource);
    rebind(soleRunDir(fixture), "candidate", shaCand);
    const ok = runHarness(["verify-evidence", "--dir", fixture, "--repo", repoDir]);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("verify-evidence: OK");

    const warnFixture = makeFixture(handoffSource);
    rebind(soleRunDir(warnFixture), "no-such-tag-anywhere", shaCand);
    const warned = runHarness(["verify-evidence", "--dir", warnFixture, "--repo", repoDir]);
    expect(warned.code).toBe(0);
    expect(warned.stdout).toContain("verify-evidence: OK");
    expect(warned.stderr).toContain("warning");
    expect(warned.stderr).toContain("no-such-tag-anywhere");
    expect(warned.stderr).toContain("not re-verifiable against git");
  }, 30000);

  it("requires handoffGeneratedBy to be paired and the generating ref to resolve to the recorded sha (audit repro: unrelated valid-looking sha)", () => {
    const { repoDir, shaCand, shaOld } = makeHermeticRepo();
    // (1) EXACT audit repro: handoffGeneratedBySha replaced with an unrelated
    // but valid-looking 40-hex sha -> git resolution mismatch + (qualifying)
    // tagSha inequality, both errors.
    let fixture = makeFixture(handoffSource);
    let runDir = soleRunDir(fixture);
    rebind(runDir, "candidate", shaCand);
    let rp = join(runDir, "version-flag", "handoff", "result.json");
    let rec = JSON.parse(readFileSync(rp, "utf8"));
    rec.handoffGeneratedBySha = shaOld;
    writeFileSync(rp, JSON.stringify(rec, null, 2) + "\n");
    let res = runHarness(["verify-evidence", "--dir", fixture, "--repo", repoDir]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("generating-ref binding mismatch");
    expect(res.stderr).toContain("does not equal the evaluated tagSha");

    // (2) half-filled pair: ref present, sha null
    fixture = makeFixture(handoffSource);
    runDir = soleRunDir(fixture);
    rebind(runDir, "candidate", shaCand);
    rp = join(runDir, "version-flag", "handoff", "result.json");
    rec = JSON.parse(readFileSync(rp, "utf8"));
    rec.handoffGeneratedBySha = null;
    writeFileSync(rp, JSON.stringify(rec, null, 2) + "\n");
    res = runHarness(["verify-evidence", "--dir", fixture, "--repo", repoDir]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("must be paired");
    // ... and sha present, ref null
    fixture = makeFixture(handoffSource);
    runDir = soleRunDir(fixture);
    rebind(runDir, "candidate", shaCand);
    rp = join(runDir, "version-flag", "handoff", "result.json");
    rec = JSON.parse(readFileSync(rp, "utf8"));
    rec.handoffGeneratedByRef = null;
    writeFileSync(rp, JSON.stringify(rec, null, 2) + "\n");
    res = runHarness(["verify-evidence", "--dir", fixture, "--repo", repoDir]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("must be paired");

    // (3) missing provenance on a release-qualifying record is an error too
    fixture = makeFixture(handoffSource);
    runDir = soleRunDir(fixture);
    rebind(runDir, "candidate", shaCand);
    rp = join(runDir, "version-flag", "handoff", "result.json");
    rec = JSON.parse(readFileSync(rp, "utf8"));
    delete rec.handoffGeneratedByRef;
    delete rec.handoffGeneratedBySha;
    writeFileSync(rp, JSON.stringify(rec, null, 2) + "\n");
    res = runHarness(["verify-evidence", "--dir", fixture, "--repo", repoDir]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("requires handoffGeneratedBySha === tagSha");

    // (4) a fully consistent generating binding passes
    fixture = makeFixture(handoffSource);
    rebind(soleRunDir(fixture), "candidate", shaCand);
    const ok = runHarness(["verify-evidence", "--dir", fixture, "--repo", repoDir]);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("verify-evidence: OK");
  }, 30000);

  it("errors on an unresolvable generating ref for a qualifying record; a non-qualifying record with an older artifact passes", () => {
    const { repoDir, shaCand, shaOld } = makeHermeticRepo();
    // release-qualifying (status "ran" + condition "handoff"): unresolvable
    // generating ref = ERROR
    let fixture = makeFixture(handoffSource);
    let runDir = soleRunDir(fixture);
    rebind(runDir, "candidate", shaCand);
    let rp = join(runDir, "version-flag", "handoff", "result.json");
    let rec = JSON.parse(readFileSync(rp, "utf8"));
    rec.handoffGeneratedByRef = "no-such-ref-anywhere";
    writeFileSync(rp, JSON.stringify(rec, null, 2) + "\n");
    let res = runHarness(["verify-evidence", "--dir", fixture, "--repo", repoDir]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("generating-ref resolution required for a release-qualifying record");

    // non-qualifying (status "not-run"): older artifact generated by an older
    // ref is allowed, with the generating ref RESOLVING to the recorded sha
    fixture = makeFixture(handoffSource);
    runDir = soleRunDir(fixture);
    rebind(runDir, "candidate", shaCand);
    rp = join(runDir, "version-flag", "handoff", "result.json");
    rec = JSON.parse(readFileSync(rp, "utf8"));
    rec.status = "not-run";
    rec.notRunReason = "pi receiver provider unfunded (402); artifact ready for the funded rerun";
    rec.execution = { invocation: null, exitCode: null, signal: null, timedOut: null, wallMs: null, stdoutLog: null, stderrLog: null };
    rec.handoffGeneratedByRef = "older";
    rec.handoffGeneratedBySha = shaOld;
    rec.notes = "non-qualifying record (not-run): consumes an artifact generated by the older ref";
    writeFileSync(rp, JSON.stringify(rec, null, 2) + "\n");
    // the record changed — regenerate the committed summary with the shared path
    const runJsonAfter = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
    const { data: dataAfter, md: mdAfter } = mod.generateSummary(runDir, runJsonAfter);
    writeFileSync(join(runDir, "summary.json"), JSON.stringify(dataAfter, null, 2) + "\n");
    writeFileSync(join(runDir, "summary.md"), mdAfter);
    res = runHarness(["verify-evidence", "--dir", fixture, "--repo", repoDir]);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("verify-evidence: OK");

    // the same stale provenance on a QUALIFYING record stays an error
    fixture = makeFixture(handoffSource);
    runDir = soleRunDir(fixture);
    rebind(runDir, "candidate", shaCand);
    rp = join(runDir, "version-flag", "handoff", "result.json");
    rec = JSON.parse(readFileSync(rp, "utf8"));
    rec.handoffGeneratedByRef = "older";
    rec.handoffGeneratedBySha = shaOld;
    writeFileSync(rp, JSON.stringify(rec, null, 2) + "\n");
    res = runHarness(["verify-evidence", "--dir", fixture, "--repo", repoDir]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("does not equal the evaluated tagSha");
  }, 30000);

  it("rejects a record whose tagSha / refName / environment.ref do not match the run manifest", () => {
    // tagSha mismatch
    let fixture = makeFixture(handoffSource);
    let rp = join(soleRunDir(fixture), "version-flag", "baseline", "result.json");
    let rec = JSON.parse(readFileSync(rp, "utf8"));
    rec.tagSha = "b".repeat(40);
    writeFileSync(rp, JSON.stringify(rec));
    let res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("does not match the run manifest tagSha");

    // refName mismatch
    fixture = makeFixture(handoffSource);
    rp = join(soleRunDir(fixture), "version-flag", "baseline", "result.json");
    rec = JSON.parse(readFileSync(rp, "utf8"));
    rec.refName = "v9.9.9-other";
    writeFileSync(rp, JSON.stringify(rec));
    res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("does not match the run manifest refName");

    // environment.ref mismatch
    fixture = makeFixture(handoffSource);
    rp = join(soleRunDir(fixture), "version-flag", "baseline", "result.json");
    rec = JSON.parse(readFileSync(rp, "utf8"));
    rec.environment.ref = "c".repeat(40);
    writeFileSync(rp, JSON.stringify(rec));
    res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("environment.ref");
    expect(res.stderr).toContain("exact candidate binding");
  }, 30000);

  it("detects summary drift and --fix regenerates the canonical summary", () => {
    // drift = error
    let fixture = makeFixture(handoffSource);
    const sp = join(soleRunDir(fixture), "summary.json");
    const committed = JSON.parse(readFileSync(sp, "utf8"));
    (committed.rows as Array<{ status?: string }>)[0]!.status = "manual";
    writeFileSync(sp, JSON.stringify(committed, null, 2) + "\n");
    let res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("summary drift");

    // --fix regenerates and passes; the rewritten summary matches the records
    fixture = makeFixture(handoffSource);
    const sp2 = join(soleRunDir(fixture), "summary.json");
    const committed2 = JSON.parse(readFileSync(sp2, "utf8"));
    (committed2.rows as Array<{ status?: string }>)[0]!.status = "manual";
    writeFileSync(sp2, JSON.stringify(committed2, null, 2) + "\n");
    res = runHarness(["verify-evidence", "--dir", fixture, "--fix"]);
    expect(res.code).toBe(0);
    expect(res.stderr).toContain("summary drift FIXED");
    const runDir = soleRunDir(fixture);
    const runJson = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
    const { data } = mod.generateSummary(runDir, runJson);
    expect(JSON.parse(readFileSync(sp2, "utf8"))).toEqual(data);
    const after = runHarness(["verify-evidence", "--dir", fixture]);
    expect(after.code).toBe(0);
    expect(after.stdout).toContain("verify-evidence: OK");
  }, 30000);

  it("detects a tampered summary.md by byte comparison and --fix repairs BOTH outputs (audit repro)", () => {
    // EXACT audit repro: append "FULL MATRIX PASS (tampered)" to summary.md —
    // summary.json still matches, so only the byte comparison catches it.
    let fixture = makeFixture(handoffSource);
    let runDir = soleRunDir(fixture);
    appendFileSync(join(runDir, "summary.md"), "\nFULL MATRIX PASS (tampered)\n");
    let res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("summary drift in summary.md");

    // --fix repairs BOTH outputs from the canonical regeneration
    fixture = makeFixture(handoffSource);
    runDir = soleRunDir(fixture);
    appendFileSync(join(runDir, "summary.md"), "\nFULL MATRIX PASS (tampered)\n");
    res = runHarness(["verify-evidence", "--dir", fixture, "--fix"]);
    expect(res.code).toBe(0);
    expect(res.stderr).toContain("summary drift FIXED");
    const runJson = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
    const { data, md } = mod.generateSummary(runDir, runJson);
    expect(readFileSync(join(runDir, "summary.md"), "utf8")).toBe(md);
    expect(JSON.parse(readFileSync(join(runDir, "summary.json"), "utf8"))).toEqual(data);
    expect(readFileSync(join(runDir, "summary.md"), "utf8")).not.toContain("FULL MATRIX PASS (tampered)");
    const after = runHarness(["verify-evidence", "--dir", fixture]);
    expect(after.code).toBe(0);
    expect(after.stdout).toContain("verify-evidence: OK");
  }, 30000);

  it("rejects the EXACT audit repro: run.json.refName removed (missing mandatory manifest field)", () => {
    const fixture = makeFixture(handoffSource);
    const rjp = join(soleRunDir(fixture), "run.json");
    const runJson = JSON.parse(readFileSync(rjp, "utf8"));
    delete runJson.refName;
    writeFileSync(rjp, JSON.stringify(runJson, null, 2) + "\n");
    const res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("refName must be a non-empty string");
  }, 30000);

  it("validates the v2 run manifest: empty mandatory fields, bad tagSha, bad tasks, ref/tagSha drift fail", () => {
    const valid = {
      schema: "harnie-eval-run/v2",
      runId: "eval-20260908T2106-leg",
      repo: "Harnie",
      ref: "a".repeat(40),
      refName: "v0.1.0-rc.2",
      tagSha: "a".repeat(40),
      createdAt: "2026-09-08T21:06:05.755Z",
      node: "v22.23.0",
      platform: "darwin",
      tasks: ["version-flag"],
    };
    expect(mod.validateRunV2(valid).ok).toBe(true);
    // non-empty mandatory fields
    for (const key of ["repo", "ref", "refName", "createdAt", "node", "platform"] as const) {
      const empty = { ...valid, [key]: "" };
      expect(mod.validateRunV2(empty).ok).toBe(false);
      expect(mod.validateRunV2(empty).errors.join("\n")).toContain(`${key} must be a non-empty string`);
      const gone = { ...valid };
      delete (gone as Record<string, unknown>)[key];
      expect(mod.validateRunV2(gone).ok).toBe(false);
      expect(mod.validateRunV2(gone).errors.join("\n")).toContain(`${key} must be a non-empty string`);
    }
    // tagSha must be 40-hex
    expect(mod.validateRunV2({ ...valid, tagSha: "nothex" }).errors.join("\n")).toContain(
      "tagSha must be a resolved 40-hex commit sha",
    );
    // ref must equal tagSha
    expect(mod.validateRunV2({ ...valid, ref: "b".repeat(40) }).errors.join("\n")).toContain("ref must equal tagSha");
    // tasks must be a non-empty array of registered task ids
    expect(mod.validateRunV2({ ...valid, tasks: [] }).errors.join("\n")).toContain("tasks must be a non-empty array");
    expect(mod.validateRunV2({ ...valid, tasks: ["version-flag", "no-such-task"] }).errors.join("\n")).toContain(
      "is not a registered task id",
    );
    expect(mod.validateRunV2({ ...valid, tasks: [""] }).errors.join("\n")).toContain("tasks[0] must be a non-empty string");

    // end-to-end: the same classes of tampering fail verify-evidence
    const tamper = (mutate: (r: Record<string, unknown>) => void, expectIn: string) => {
      const fixture = makeFixture(handoffSource);
      const rjp = join(soleRunDir(fixture), "run.json");
      const runJson = JSON.parse(readFileSync(rjp, "utf8"));
      mutate(runJson);
      writeFileSync(rjp, JSON.stringify(runJson, null, 2) + "\n");
      const res = runHarness(["verify-evidence", "--dir", fixture]);
      expect(res.code).not.toBe(0);
      expect(res.stderr).toContain(expectIn);
    };
    tamper((r) => { r.repo = ""; }, "repo must be a non-empty string");
    tamper((r) => { r.node = null; }, "node must be a non-empty string");
    tamper((r) => { r.platform = ""; }, "platform must be a non-empty string");
    tamper((r) => { r.createdAt = null; }, "createdAt must be a non-empty string");
    tamper((r) => { r.tagSha = "0231dd7"; }, "tagSha must be a resolved 40-hex commit sha");
    tamper((r) => { r.ref = "b".repeat(40); }, "ref must equal tagSha");
    tamper((r) => { r.tasks = []; }, "tasks must be a non-empty array");
    tamper((r) => { r.tasks = ["no-such-task"]; }, "is not a registered task id");
  }, 30000);

  it("rejects the EXACT audit repro: v2 record with environment.ref null", () => {
    const fixture = makeFixture(handoffSource);
    const rp = join(soleRunDir(fixture), "version-flag", "baseline", "result.json");
    const rec = JSON.parse(readFileSync(rp, "utf8"));
    rec.environment.ref = null;
    writeFileSync(rp, JSON.stringify(rec, null, 2) + "\n");
    const res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("environment.ref must be a 40-hex commit sha");
  }, 30000);

  it("rejects the EXACT audit repro: a coordinated 2020 backdate of manifest + records", () => {
    const fixture = makeFixture(handoffSource);
    const runDir = soleRunDir(fixture);
    const rjp = join(runDir, "run.json");
    const runJson = JSON.parse(readFileSync(rjp, "utf8"));
    runJson.createdAt = "2020-01-01T00:00:00.000Z";
    writeFileSync(rjp, JSON.stringify(runJson, null, 2) + "\n");
    for (const cond of ["handoff", "baseline"]) {
      const rp = join(runDir, "version-flag", cond, "result.json");
      const rec = JSON.parse(readFileSync(rp, "utf8"));
      rec.recordedAt = "2020-01-01T00:00:00.000Z";
      writeFileSync(rp, JSON.stringify(rec, null, 2) + "\n");
    }
    const res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    // the runId encodes the real execution stamp; the backdated createdAt sits
    // ~6 years earlier — the binding check fires (stamp more than 10 min AFTER
    // the fabricated createdAt), and the README date-agreement check fails the
    // unclaimed 2020 date too.
    expect(res.stderr).toContain("runId/createdAt binding");
    expect(res.stderr).toContain("more than 10 min after");
    expect(res.stderr).toContain("not claimed anywhere in README.md");
  }, 30000);

  it("rejects a runId whose encoded stamp is more than 10 min after/before createdAt (both directions)", () => {
    // runId stamp LATER than createdAt (e.g. the id encodes a planned slot)
    let fixture = makeFixture(handoffSource);
    let runDir = soleRunDir(fixture);
    let rjp = join(runDir, "run.json");
    let runJson = JSON.parse(readFileSync(rjp, "utf8"));
    runJson.createdAt = new Date(Date.parse(runJson.createdAt) - 3600 * 1000).toISOString();
    writeFileSync(rjp, JSON.stringify(runJson, null, 2) + "\n");
    for (const cond of ["handoff", "baseline"]) {
      const rp = join(runDir, "version-flag", cond, "result.json");
      const rec = JSON.parse(readFileSync(rp, "utf8"));
      rec.recordedAt = runJson.createdAt;
      writeFileSync(rp, JSON.stringify(rec, null, 2) + "\n");
    }
    let res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("more than 10 min after");
    expect(res.stderr).toContain("runId/createdAt binding");

    // unparseable runId (no encoded stamp) is an error, never a silent pass
    fixture = makeFixture(handoffSource);
    runDir = soleRunDir(fixture);
    rjp = join(runDir, "run.json");
    runJson = JSON.parse(readFileSync(rjp, "utf8"));
    runJson.runId = "eval-hand-authored-label";
    writeFileSync(rjp, JSON.stringify(runJson, null, 2) + "\n");
    const newDir = join(dirname(runDir), runJson.runId);
    renameSync(runDir, newDir);
    res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("does not encode a UTC execution timestamp");
  }, 30000);

  it("rejects a future-dated createdAt at verification time (live-clock check)", () => {
    const fixture = makeFixture(handoffSource);
    const runDir = soleRunDir(fixture);
    const rjp = join(runDir, "run.json");
    const runJson = JSON.parse(readFileSync(rjp, "utf8"));
    runJson.createdAt = new Date(Date.now() + 3600 * 1000).toISOString();
    writeFileSync(rjp, JSON.stringify(runJson, null, 2) + "\n");
    const res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("future-dated manifest");
  }, 30000);

  it("requires the eval README to claim every manifest createdAt date (date agreement)", () => {
    const fixture = makeFixture(handoffSource);
    writeFileSync(join(fixture, "README.md"), "# fixture eval — dates deliberately omitted\n");
    const res = runHarness(["verify-evidence", "--dir", fixture]);
    expect(res.code).not.toBe(0);
    expect(res.stderr).toContain("not claimed anywhere in README.md");
  }, 30000);

  it("records an execution-time attestation via --attest and verifies its presence and shape", () => {
    const runId = uniqueRun();
    const res = runHarness([
      "run",
      "--task",
      "version-flag",
      "--condition",
      "baseline",
      "--run",
      runId,
      "--agent-command",
      agentCommand("AT"),
      "--attest",
      "ci-run-12345",
    ], {
      GITHUB_RUN_ID: "",
      GITHUB_REPOSITORY: "",
      GITHUB_ACTOR: "",
    });
    expect(res.code).toBe(0);
    const runJson = JSON.parse(readFileSync(join(EVAL_BASE, runId, "run.json"), "utf8"));
    expect(runJson.attestation).toMatchObject({ source: "provided", attestation: "ci-run-12345" });
    expect(typeof runJson.attestation.capturedAt).toBe("string");

    // the attested manifest verifies; a stripped attestation fails the shape check
    const fixture = makeFixture(handoffSource, runId);
    const ok = runHarness(["verify-evidence", "--dir", fixture]);
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("verify-evidence: OK");

    const stripped = makeFixture(handoffSource, runId);
    const sp = join(soleRunDir(stripped), "run.json");
    const rj = JSON.parse(readFileSync(sp, "utf8"));
    delete rj.attestation.capturedAt;
    writeFileSync(sp, JSON.stringify(rj, null, 2) + "\n");
    const bad = runHarness(["verify-evidence", "--dir", stripped]);
    expect(bad.code).not.toBe(0);
    expect(bad.stderr).toContain("attestation.capturedAt must be an ISO timestamp");
  }, 30000);
});

afterAll(() => {
  for (const dir of cleanupDirs) rmSync(dir, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
}, 60000);
