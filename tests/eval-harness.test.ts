import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

interface EvalMod {
  TASKS: Array<{ id: string; files: string[]; statement: string; verify: string[] }>;
  validateResult: (r: unknown) => { ok: boolean; errors: string[] };
  validateResultV1: (r: unknown) => { ok: boolean; errors: string[] };
  validateResultV2: (r: unknown) => { ok: boolean; errors: string[] };
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
    expect(readFileSync(join(EVAL_BASE, runId, "run.json"), "utf8")).toContain("harnie-eval-run/v2");
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
    ]);
    expect(res.code).toBe(0);

    const base = join(EVAL_BASE, runId, "first-run-recovery");
    const handoffResult = JSON.parse(readFileSync(join(base, "handoff", "result.json"), "utf8"));
    const baselineResult = JSON.parse(readFileSync(join(base, "baseline", "result.json"), "utf8"));
    expect(handoffResult.handoff.path).not.toMatch(/^\//);
    expect(resolve(join(base, "handoff"), handoffResult.handoff.path)).toBe(handoffFile);
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

  it("v2 records require the provenance fields; unknown schemas are rejected", () => {
    const v2 = {
      schema: "harnie-eval-result/v2",
      runId: "r", taskId: "version-flag", recordedAt: "now", condition: "baseline",
      status: "ran", notRunReason: null,
      sourceHarness: null, targetHarness: "opencode",
      tagSha: "a".repeat(40), refName: "v0.1.0-rc.3", handoffArtifactSha: null,
      environment: { agent: "opencode" }, handoff: { path: null, chars: null, sha256: null },
      execution: {}, commandsRun: [], edits: { files: [] },
      verification: {},
      metrics: {
        developerReExplanation: "unknown", repeatedInvestigation: "unknown",
        repeatedFinishedEdits: "unknown", nextActionCorrect: "unknown",
        missingOrFalseContext: "unknown", taskCompleted: null, falseCompletion: null,
        packageSizeChars: null,
      },
      notes: null,
    };
    expect(mod.validateResult(v2).ok).toBe(true);
    const noTagSha = { ...v2, tagSha: undefined };
    expect(mod.validateResultV2(noTagSha).ok).toBe(false);
    // v1 stays tolerant of extra fields (archived records must keep passing);
    // unknown schemas are rejected by dispatch.
    expect(mod.validateResult({ ...v2, schema: "harnie-eval-result/v1" }).ok).toBe(true);
    expect(mod.validateResult({ ...v2, schema: "harnie-eval-result/v3" }).ok).toBe(false);
  });
});

describe("eval harness — verify-evidence integrity check", () => {
  // Builds a curated eval-dir fixture from a real harness run (baseline +
  // handoff with a driver artifact), then returns its root path.
  const makeFixture = (handoffFile: string) => {
    const runId = uniqueRun();
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
    const driverCopy = join(fixtureRoot, "driver", "fake-handoff-ve.md");
    cpSync(handoffFile, driverCopy);
    const handoffResultPath = join(runsDir, "version-flag", "handoff", "result.json");
    const handoffResult = JSON.parse(readFileSync(handoffResultPath, "utf8"));
    handoffResult.handoff.path = relative(join(runsDir, "version-flag", "handoff"), driverCopy);
    writeFileSync(handoffResultPath, JSON.stringify(handoffResult, null, 2) + "\n");
    writeFileSync(join(runsDir, "summary.md"), "# fixture summary\n");
    writeFileSync(join(runsDir, "summary.json"), JSON.stringify({ rows: [] }));
    writeFileSync(join(fixtureRoot, "README.md"), "# fixture eval\n");
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
});

afterAll(() => {
  for (const dir of cleanupDirs) rmSync(dir, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});
