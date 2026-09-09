#!/usr/bin/env node
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  openSync,
  closeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const EVAL_ROOT = process.env.HARNIE_EVAL_ROOT || join(tmpdir(), "opencode", "harnie-eval");
const RESULT_SCHEMA = "harnie-eval-result/v1";
const CONDITIONS = ["handoff", "baseline"];

export const TASKS = [
  {
    id: "version-flag",
    area: "cli-args",
    files: ["src/cli.ts"],
    statement:
      "Add a --version flag to the Harnie CLI that prints the package version.",
    details:
      "When the CLI is invoked with --version (or -v) as its first argument, print the version declared in package.json (read it, do not hardcode) to stdout and exit with code 0, before any other argument handling. All other flags and commands must behave exactly as before.",
    verify: [
      "npm run build",
      "node dist/cli.js --version   # prints 0.0.0, exit 0",
      "npx vitest run tests/cli-init.test.ts   # still green",
    ],
    endState:
      "`node dist/cli.js --version` prints 0.0.0 and exits 0; existing CLI behavior and the cli-init tests are unchanged.",
  },
  {
    id: "shebang-guard",
    area: "build-script",
    files: ["scripts/prepare-bin.mjs"],
    statement:
      "Make scripts/prepare-bin.mjs fail with a clear message when dist/cli.js lacks a shebang.",
    details:
      "Before chmodding dist/cli.js, the script must check that dist/cli.js exists and begins with '#!'. If the file is missing or lacks the shebang, print a clear error to stderr naming dist/cli.js and the missing shebang, and exit non-zero. Otherwise chmod 0o755 and exit 0 as today. Edit only scripts/prepare-bin.mjs.",
    verify: [
      "npm run build && node scripts/prepare-bin.mjs   # exits 0 (shebang present)",
      "node -e \"const fs=require('fs');const s=fs.readFileSync('dist/cli.js','utf8');fs.writeFileSync('dist/cli.js',s.replace(/^#![^\n]*\\n/,''))\" && node scripts/prepare-bin.mjs   # exits non-zero with the shebang error",
      "npm run build   # restores dist/cli.js",
      "npm run test:package   # still green",
    ],
    endState:
      "prepare-bin.mjs exits 0 when dist/cli.js has a shebang and exits non-zero with a clear stderr message when it does not; the normal build and package smoke test still pass.",
  },
  {
    id: "first-run-recovery",
    area: "docs",
    files: ["docs/internal/FIRST-RUN.md"],
    statement:
      "Document backup/restore recovery in the first-run walkthrough.",
    details:
      "Add a short '## Recovery' section to docs/internal/FIRST-RUN.md covering: `harnie backup <path>` writes a consistent SQLite snapshot (0600), `harnie restore <path> --force` validates the backup and then overwrites the live store, and restore has no undo. Edit only that file; no code changes.",
    verify: [
      "grep -n '^## Recovery' docs/internal/FIRST-RUN.md   # section exists",
      "git diff --stat   # only docs/internal/FIRST-RUN.md modified",
    ],
    endState:
      "docs/internal/FIRST-RUN.md has a Recovery section with backup/restore usage and the no-undo caveat; no other file is modified.",
  },
  {
    id: "help-regression-test",
    area: "tests",
    files: ["tests/regression-help.test.ts"],
    statement:
      "Add a regression test that pins the CLI help surface.",
    details:
      "Create tests/regression-help.test.ts importing runCli from ../src/cli.js, capturing stdout for a [\"--help\"] invocation (follow the capture() pattern in tests/cli-init.test.ts), and asserting the help output includes 'backup <path>', 'restore <path> [--force]', 'handoff <work>', and 'import pi <path>'. Do not modify any existing file.",
    verify: [
      "npx vitest run tests/regression-help.test.ts   # passes",
      "npm run typecheck   # clean",
    ],
    endState:
      "A new passing tests/regression-help.test.ts exists pinning the four help strings; no existing file is modified.",
  },
  {
    // Continuation-semantics task (added 2026-09-09, directed-matrix eval):
    // the driver session completes steps 1-2 of a 3-step task; the receiver
    // must do the NEXT step, not a fresh small edit. The pre-state (steps 1-2)
    // is applied to the clone by the harness `--patch` flag as a driver commit.
    // If a clone lacks src/greeting.ts the precondition is missing — a correct
    // receiver stops and reports it instead of fabricating the pre-state.
    id: "greeting-command",
    area: "cli-continuation",
    files: ["src/cli.ts", "src/greeting.ts", "tests/greeting.test.ts"],
    statement:
      "Complete step 3 of the 3-step greeting-command task: wire the existing greet() into the CLI as a `greet <name>` command.",
    details:
      "Steps 1 and 2 are already done and committed in this checkout: src/greeting.ts exports greet(name: string): string (returns `Hello, <name>!`; trims the name; defaults to \"world\" when empty/missing), and tests/greeting.test.ts covers basic/default/trim cases (vitest green). Your job is STEP 3 ONLY: add a `greet <name>` subcommand to src/cli.ts that prints greet(name) to stdout and exits 0, add `greet <name>` to the help/usage text, and do NOT modify src/greeting.ts or tests/greeting.test.ts. If src/greeting.ts is absent from your checkout, the precondition is missing: stop and report that instead of creating it. Then run the verification commands.",
    verify: [
      "npm run build",
      "node dist/cli.js greet Ada   # prints 'Hello, Ada!', exit 0",
      "node dist/cli.js greet '  Bob '   # prints 'Hello, Bob!', exit 0",
      "node dist/cli.js --help   # usage lists 'greet <name>'",
      "npx vitest run tests/greeting.test.ts   # still green",
    ],
    endState:
      "`greet <name>` prints greet(name) and exits 0; the usage text lists 'greet <name>'; src/greeting.ts and tests/greeting.test.ts are unchanged; the greeting vitest suite is still green.",
  },
];

// Verified 2026-09-07 against installed versions:
//   opencode 1.18.29 — `run` subcommand exposes --auto and -m/--model.
//   codex 0.149.1    — `codex exec --full-auto` does NOT exist; non-interactive
//                      exec uses --sandbox workspace-write (exec never prompts).
//   pi 0.84.4        — `--print` is the non-interactive mode; tools enabled by
//                      default; `--model` supports "provider/id".
// Model flags are injected per-agent (after the subcommand) via modelArgs.
const AGENTS = {
  opencode: {
    bin: "opencode",
    args: ["run", "--auto", "{prompt_text}"],
    modelArgs: ["-m", "{model}"],
    note: "--auto auto-approves non-denied permissions; required for edits in a non-interactive run.",
  },
  codex: {
    bin: "codex",
    args: ["exec", "--sandbox", "workspace-write", "{prompt_text}"],
    modelArgs: ["-m", "{model}"],
    note: "codex exec is non-interactive and never prompts; --sandbox workspace-write lets it edit the clone (there is no --full-auto flag in codex-cli 0.149.1).",
  },
  pi: {
    bin: "pi",
    args: ["--print", "{prompt_text}"],
    modelArgs: ["--model", "{model}"],
    note: "pi --print is non-interactive; read/bash/edit/write tools are enabled by default; --model supports \"provider/id\".",
  },
};

function parseArgs(argv) {
  const valueFlags = new Set([
    "task",
    "condition",
    "agent",
    "handoff",
    "ref",
    "run",
    "agent-command",
    "model",
    "timeout",
    "file",
    "dir",
    "source-harness",
    "target-harness",
    "patch",
  ]);
  const parsed = { _: [], flags: {}, multi: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      parsed._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (key === "agent-arg") {
        (parsed.multi["agent-arg"] ??= []).push(next);
        i++;
        continue;
      }
      if (valueFlags.has(key) && next !== undefined && !next.startsWith("--")) {
        parsed.flags[key] = next;
        i++;
      } else {
        parsed.flags[key] = true;
      }
    } else if (a === "-m") {
      // `-m` alias for --model (used in the protocol examples); previously this
      // fell through to positionals and the model was silently dropped.
      parsed.flags.model = argv[i + 1];
      i++;
    } else {
      parsed._.push(a);
    }
  }
  return parsed;
}

function git(repo, args) {
  // No .trim() here: `git status --porcelain` prefixes unstaged modifications
  // with a single space ("M src/cli.ts" would corrupt column parsing).
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" });
}

function snapshotWorkTree(repo, tmpDir) {
  const idx = join(tmpDir, "snapshot-index");
  rmSync(idx, { force: true });
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  execFileSync("git", ["add", "-A", "."], { cwd: repo, env });
  const tree = execFileSync("git", ["write-tree"], { cwd: repo, env, encoding: "utf8" }).trim();
  const parent = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
  const commit = execFileSync(
    "git",
    ["commit-tree", tree, "-p", parent, "-m", "harnie eval worktree snapshot"],
    { cwd: repo, encoding: "utf8" },
  ).trim();
  rmSync(idx, { force: true });
  return commit;
}

function prepareClone({ repo, ref, dir }) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dirname(dir), { recursive: true });
  execFileSync("git", ["clone", "--quiet", "--no-hardlinks", repo, dir]);
  if (ref && ref !== "HEAD") {
    execFileSync("git", ["-C", dir, "checkout", "--quiet", "--detach", ref]);
  }
  const head = git(dir, ["rev-parse", "HEAD"]).trim();
  const nm = join(REPO_ROOT, "node_modules");
  if (existsSync(nm) && !existsSync(join(dir, "node_modules"))) {
    symlinkSync(nm, join(dir, "node_modules"));
  }
  return { dir, head };
}

export function buildPrompt(task, condition, handoffContent) {
  const lines = [];
  lines.push(`# Harnie continuation evaluation — task: ${task.id}`);
  lines.push("");
  if (condition === "handoff") {
    lines.push(
      "A previous agent session already worked on this task in this repository. The Harnie handoff package produced from that session appears at the bottom of this message. Use it as your context; do not re-investigate from scratch.",
    );
  } else {
    lines.push("No prior-session context is provided. Complete the task from the statement below.");
  }
  lines.push("");
  lines.push("## Task");
  lines.push(task.statement);
  lines.push("");
  lines.push(task.details);
  lines.push("");
  lines.push("## Required verification");
  for (const v of task.verify) lines.push(`- ${v}`);
  lines.push("");
  lines.push("## Expected end state");
  lines.push(task.endState);
  lines.push("");
  lines.push("## Working rules");
  lines.push("- Work directly in this repository checkout (your current directory).");
  lines.push("- Make the required edits yourself and run the verification commands.");
  lines.push("- Do not commit; leave the working tree dirty with your edits.");
  lines.push(
    "- When finished, print a report: (1) files edited, (2) commands run, (3) verification pass/fail, (4) whether the task is complete.",
  );
  if (condition === "handoff") {
    lines.push("");
    lines.push("## Continuation handoff (from prior session)");
    lines.push(handoffContent ?? "(no handoff content was provided)");
  }
  return lines.join("\n") + "\n";
}

function splitCommand(str) {
  const out = [];
  let cur = "";
  let quote = null;
  for (const ch of str) {
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === " ") {
      if (cur) out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function whichBin(bin) {
  try {
    return execFileSync("which", [bin], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function agentVersion(bin) {
  try {
    return execFileSync(bin, ["--version"], { encoding: "utf8", timeout: 15000 }).trim();
  } catch {
    return null;
  }
}

function emptyMetrics() {
  return {
    developerReExplanation: "unknown",
    repeatedInvestigation: "unknown",
    repeatedFinishedEdits: "unknown",
    nextActionCorrect: "unknown",
    missingOrFalseContext: "unknown",
    taskCompleted: null,
    falseCompletion: null,
    packageSizeChars: null,
  };
}

export function validateResult(r) {
  const errors = [];
  if (!r || typeof r !== "object") return { ok: false, errors: ["result is not an object"] };
  if (r.schema !== RESULT_SCHEMA) errors.push(`schema must be "${RESULT_SCHEMA}"`);
  for (const key of ["runId", "taskId", "recordedAt"]) {
    if (typeof r[key] !== "string" || !r[key]) errors.push(`${key} must be a non-empty string`);
  }
  if (!CONDITIONS.includes(r.condition)) errors.push(`condition must be one of ${CONDITIONS.join("|")}`);
  if (!["ran", "manual", "not-run"].includes(r.status)) errors.push('status must be "ran"|"manual"|"not-run"');
  if (!r.environment || typeof r.environment.agent !== "string" || !r.environment.agent) {
    errors.push("environment.agent must be a non-empty string");
  }
  if (!r.handoff || typeof r.handoff !== "object") errors.push("handoff must be an object");
  if (!r.execution || typeof r.execution !== "object") errors.push("execution must be an object");
  if (!r.commandsRun || !Array.isArray(r.commandsRun)) errors.push("commandsRun must be an array");
  if (!r.edits || typeof r.edits !== "object" || !Array.isArray(r.edits.files)) {
    errors.push("edits.files must be an array");
  }
  if (!r.verification || typeof r.verification !== "object") errors.push("verification must be an object");
  // Directed-matrix provenance (2026-09-09): which harness produced the driver
  // session, which harness consumed the handoff, and exactly which commit was
  // evaluated. sourceHarness is null only when there is no driver (baseline).
  if (r.sourceHarness !== null && (typeof r.sourceHarness !== "string" || !r.sourceHarness)) {
    errors.push("sourceHarness must be a non-empty string or null");
  }
  if (typeof r.targetHarness !== "string" || !r.targetHarness) {
    errors.push("targetHarness must be a non-empty string");
  }
  if (typeof r.tagSha !== "string" || !/^[0-9a-f]{40}$/.test(r.tagSha)) {
    errors.push("tagSha must be a resolved 40-hex commit sha");
  }
  if (typeof r.refName !== "string" || !r.refName) {
    errors.push("refName must be a non-empty string");
  }
  if (r.handoffArtifactSha !== null && !/^[0-9a-f]{64}$/.test(r.handoffArtifactSha ?? "")) {
    errors.push("handoffArtifactSha must be a 64-hex sha256 or null");
  }
  const m = r.metrics;
  if (!m || typeof m !== "object") {
    errors.push("metrics must be an object");
  } else {
    const enums = {
      developerReExplanation: ["none", "partial", "full", "not-needed", "unknown"],
      repeatedInvestigation: ["none", "partial", "full", "unknown"],
      repeatedFinishedEdits: ["none", "yes", "unknown"],
      nextActionCorrect: ["yes", "no", "partial", "unknown"],
      missingOrFalseContext: ["none", "missing", "false", "both", "none-needed", "unknown"],
    };
    for (const [key, allowed] of Object.entries(enums)) {
      if (!allowed.includes(m[key])) errors.push(`metrics.${key} must be one of ${allowed.join("|")}`);
    }
    for (const key of ["taskCompleted", "falseCompletion"]) {
      if (m[key] !== true && m[key] !== false && m[key] !== null) {
        errors.push(`metrics.${key} must be true, false, or null`);
      }
    }
    if (m.packageSizeChars !== null && !Number.isFinite(m.packageSizeChars)) {
      errors.push("metrics.packageSizeChars must be a number or null");
    }
  }
  return { ok: errors.length === 0, errors };
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

// Continuation-semantics support: apply the driver's completed steps (steps
// 1-2 of the task) to the receiver clone BEFORE the receiver runs, as a real
// commit. Without this, a receiver would be handed a handoff describing work
// that is not in the repo — testing instruction-following, not continuation.
// Committing (rather than leaving the patch uncommitted) keeps collectEvidence
// honest: git status then shows only the receiver's own edits.
function applyDriverPatch(cloneDir, patchPath) {
  execFileSync("git", ["-C", cloneDir, "apply", "--whitespace=nowarn", patchPath]);
  execFileSync("git", ["-C", cloneDir, "add", "-A"]);
  execFileSync("git", ["-C", cloneDir, "-c", "user.name=harnie-eval", "-c", "user.email=eval@harnie.local", "commit", "--quiet", "--no-gpg-sign", "-m", "eval driver pre-applied steps (harness --patch)"]);
  return { path: patchPath, sha256: sha256File(patchPath), committed: true };
}

function ensureRun({ repo, refInput, runId }) {
  const runDir = join(EVAL_ROOT, runId);
  const runJsonPath = join(runDir, "run.json");
  if (existsSync(runJsonPath)) {
    return { runDir, run: JSON.parse(readFileSync(runJsonPath, "utf8")) };
  }
  mkdirSync(runDir, { recursive: true });
  let ref = refInput || "HEAD";
  const refName = refInput || "HEAD";
  if (ref === "worktree") {
    ref = snapshotWorkTree(repo, runDir);
  }
  // Resolve the ref to the exact commit the receivers will be checked out at
  // (recorded as tagSha). `git checkout --detach <tag>` is equivalent, but the
  // resolved sha makes every result row auditable against the candidate.
  let tagSha = null;
  try {
    tagSha = git(repo, ["rev-parse", `${ref}^{commit}`]).trim();
  } catch {
    tagSha = null; // invalid ref: prepareClone will fail loudly below
  }
  const run = {
    schema: "harnie-eval-run/v1",
    runId,
    repo,
    ref: tagSha ?? ref,
    refName,
    tagSha,
    refInput: refInput || "HEAD",
    createdAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    tasks: TASKS.map((t) => t.id),
  };
  writeFileSync(runJsonPath, JSON.stringify(run, null, 2) + "\n");
  return { runDir, run };
}

function resultTemplate({ task, condition, run, dirName, handoffPath, sourceHarness, targetHarness }) {
  return {
    schema: RESULT_SCHEMA,
    runId: run.runId,
    taskId: task.id,
    condition,
    // Directed-matrix provenance: sourceHarness=null for baseline (no driver);
    // targetHarness is the receiver harness that consumes the run.
    sourceHarness: sourceHarness ?? null,
    targetHarness: targetHarness ?? "human",
    tagSha: run.tagSha,
    refName: run.refName,
    handoffArtifactSha: null,
    patch: null,
    recordedAt: null,
    status: "not-run",
    notRunReason: "receiver has not run yet — fill this template after the manual run",
    environment: {
      agent: "human",
      agentVersion: null,
      model: null,
      node: run.node,
      platform: run.platform,
      ref: run.ref,
      clonePath: dirName,
    },
    handoff: { path: handoffPath, chars: null, sha256: null },
    execution: { invocation: null, exitCode: null, wallMs: null, stdoutLog: null, stderrLog: null },
    commandsRun: [],
    edits: { files: [], diffChars: null, diffPath: "edits.diff" },
    verification: { ran: null, commands: [], passed: null, details: null },
    metrics: emptyMetrics(),
    notes: null,
  };
}

function manualInstructions({ task, condition, run, cloneDir, promptPath, handoffPath }) {
  const dir = dirname(promptPath);
  const lines = [];
  lines.push(`# Manual receiver run — ${task.id} (${condition})`);
  lines.push("");
  lines.push(`Run dir: ${dir}`);
  lines.push(`Clone (work here): ${cloneDir}`);
  lines.push(`Prompt file (the exact receiver prompt): ${promptPath}`);
  if (handoffPath) lines.push(`Handoff artifact: ${handoffPath}`);
  lines.push("");
  lines.push("1. Open a terminal in the clone.");
  lines.push("2. Run ONE receiver CLI non-interactively with the prompt:");
  lines.push("   - opencode: `opencode run --auto \"$(cat prompt.md)\" | tee agent-stdout.log`");
  lines.push("   - codex:    `codex exec --sandbox workspace-write \"$(cat prompt.md)\" | tee agent-stdout.log`");
  lines.push("   - pi:       `pi --print \"$(cat prompt.md)\" | tee agent-stdout.log`");
  lines.push("3. After it exits, record what actually happened:");
  lines.push(`   node scripts/eval-continuation.mjs collect --dir ${dir}`);
  lines.push(
     "   (captures git status/diff and fills edits + handoff size into result.json; leave status as-is)",
  );
  lines.push("4. Fill the human-judged metrics in result.json (see metrics.* keys):");
  lines.push("   developerReExplanation, repeatedInvestigation, repeatedFinishedEdits, nextActionCorrect,");
  lines.push("   missingOrFalseContext, taskCompleted, falseCompletion. Set status to \"ran\" and recordedAt to now.");
  lines.push("   Do NOT guess: leave \"unknown\"/null if you did not observe it.");
  lines.push("5. Register the result:");
  lines.push(`   node scripts/eval-continuation.mjs record --dir ${dir} --file result.json`);
  lines.push("");
  lines.push("Never fabricate outcomes: unknown evidence stays \"unknown\"/\"not-run\".");
  return lines.join("\n") + "\n";
}

function collectEvidence(dir, cloneDir, task, handoffPath, run) {
  const status = git(cloneDir, ["status", "--porcelain"]);
  const files = status
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => l.slice(3).trim())
    // The harness itself symlinks node_modules into each clone (the repo's
    // .gitignore pattern `node_modules/` does not match a symlink); it is
    // harness infrastructure, never a receiver edit.
    .filter((f) => f !== "node_modules");
  let diffChars = null;
  let diffPath = null;
  try {
    const diff = git(cloneDir, ["diff"]);
    diffPath = join(dir, "edits.diff");
    writeFileSync(diffPath, diff);
    diffChars = diff.length;
  } catch {
    diffPath = null;
  }
  let handoff = { path: handoffPath, chars: null, sha256: null };
  if (handoffPath && existsSync(handoffPath)) {
    const content = readFileSync(handoffPath);
    handoff = { path: handoffPath, chars: content.length, sha256: sha256File(handoffPath) };
  }
  return { status, files, diffChars, diffPath, handoff };
}

function writeResult(dir, result) {
  const path = join(dir, "result.json");
  writeFileSync(path, JSON.stringify(result, null, 2) + "\n");
  return path;
}

function cmdRun(parsed) {
  const taskId = parsed.flags.task;
  const task = TASKS.find((t) => t.id === taskId);
  if (!task) {
    console.error(`Unknown task "${taskId}". Available: ${TASKS.map((t) => t.id).join(", ")}`);
    return 1;
  }
  const runId = parsed.flags.run || `eval-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}-p${process.pid}`;
  const { runDir, run } = ensureRun({ repo: REPO_ROOT, refInput: parsed.flags.ref, runId });
  const conditions = parsed.flags.condition
    ? String(parsed.flags.condition).split(",")
    : CONDITIONS;
  for (const c of conditions) {
    if (!CONDITIONS.includes(c)) {
      console.error(`Unknown condition "${c}". Available: ${CONDITIONS.join(", ")}`);
      return 1;
    }
  }
  const handoffPath = parsed.flags.handoff ? resolve(parsed.flags.handoff) : null;
  let handoffContent = null;
  if (handoffPath) {
    if (!existsSync(handoffPath)) {
      console.error(`Handoff file not found: ${handoffPath}`);
      return 1;
    }
    handoffContent = readFileSync(handoffPath, "utf8");
  }
  const patchPath = parsed.flags.patch ? resolve(parsed.flags.patch) : null;
  if (patchPath && !existsSync(patchPath)) {
    console.error(`Patch file not found: ${patchPath}`);
    return 1;
  }
  // Directed-matrix provenance: sourceHarness names the harness the driver
  // session came from (pi/opencode/codex); targetHarness names the receiver.
  // targetHarness defaults to the receiver agent; for `custom:<bin>` agent
  // commands the prefix is stripped so the value stays a harness name.
  const sourceHarness = parsed.flags["source-harness"]
    ? String(parsed.flags["source-harness"])
    : null;
  // `--handoff` is the prior-session context for the handoff condition only.
  // A baseline run must never inherit the handoff artifact (path, size, sha):
  // the 2026-09-07 summary showed handoff char counts on baseline rows purely
  // because this value leaked across conditions.
  const conditionHandoff = (c) => (c === "handoff" ? { path: handoffPath, content: handoffContent } : { path: null, content: null });

  let agentName = parsed.flags.agent || null;
  let agentArgv = null;
  const agentCommandOverride = parsed.flags["agent-command"] || process.env.HARNIE_EVAL_AGENT_COMMAND;
  if (agentCommandOverride) {
    agentArgv = splitCommand(String(agentCommandOverride));
    agentName = agentName || `custom:${agentArgv[0]}`;
  } else if (agentName && !AGENTS[agentName]) {
    console.error(`Unknown agent "${agentName}". Available: ${Object.keys(AGENTS).join(", ")}`);
    return 1;
  }
  let targetHarness = parsed.flags["target-harness"]
    ? String(parsed.flags["target-harness"])
    : agentName
      ? agentName.replace(/^custom:/, "")
      : "human";
  if (!targetHarness) targetHarness = "human";

  for (const condition of conditions) {
    const { path: condHandoffPath, content: condHandoffContent } = conditionHandoff(condition);
    // sourceHarness describes the driver of the handoff condition only; a
    // baseline run has no driver, so its provenance is null there too.
    const condSourceHarness = condition === "handoff" ? sourceHarness : null;
    const dir = join(runDir, task.id, condition);
    mkdirSync(dir, { recursive: true });
    const cloneDir = join(dir, "clone");
    const prep = prepareClone({ repo: run.repo, ref: run.ref, dir: cloneDir });
    const patchInfo = patchPath ? applyDriverPatch(cloneDir, patchPath) : null;
    const promptPath = join(dir, "prompt.md");
    writeFileSync(promptPath, buildPrompt(task, condition, condHandoffContent));

    const manual = manualInstructions({
      task,
      condition,
      run,
      cloneDir,
      promptPath,
      handoffPath: condHandoffPath,
    });

    let invocation = null;
    let canRun = false;
    if (agentArgv) {
      invocation = agentArgv.map((a) =>
        a
          .replace("{prompt_file}", promptPath)
          .replace("{prompt_text}", buildPrompt(task, condition, condHandoffContent))
          .replace("{clone}", cloneDir),
      );
      canRun = true;
    } else if (agentName) {
      const spec = AGENTS[agentName];
      const binPath = whichBin(spec.bin);
      if (binPath) {
        let args = [...(parsed.multi["agent-arg"] || []), ...spec.args];
        if (parsed.flags.model) {
          const modelArgs = (spec.modelArgs ?? ["--model", "{model}"]).map((a) =>
            a.replace("{model}", String(parsed.flags.model)),
          );
          args = [...modelArgs, ...args];
        }
        invocation = [binPath, ...args.map((a) => a.replace("{prompt_text}", buildPrompt(task, condition, condHandoffContent)).replace("{prompt_file}", promptPath).replace("{clone}", cloneDir))];
        canRun = true;
      } else {
        console.error(`[manual] ${spec.bin} not found on PATH — degrading to manual run mode.`);
      }
    }

    if (!canRun) {
      writeFileSync(join(dir, "manual-instructions.md"), manual);
      writeFileSync(join(dir, "result-template.json"), JSON.stringify(resultTemplate({ task, condition, run, dirName: cloneDir, handoffPath: condHandoffPath, sourceHarness: condSourceHarness, targetHarness }), null, 2) + "\n");
      const result = {
        ...resultTemplate({ task, condition, run, dirName: cloneDir, handoffPath: condHandoffPath, sourceHarness: condSourceHarness, targetHarness }),
        patch: patchInfo,
        status: "manual",
        recordedAt: new Date().toISOString(),
        notRunReason: "no agent CLI available/selected; manual-run mode — see manual-instructions.md",
      };
      const resultPath = writeResult(dir, result);
      console.log(`[manual] ${task.id}/${condition}`);
      console.log(manual);
      console.log(`Result skeleton: ${join(dir, "result-template.json")}`);
      console.log(`Result (status=manual): ${resultPath}`);
      continue;
    }

    const outPath = join(dir, "agent-stdout.log");
    const errPath = join(dir, "agent-stderr.log");
    const outFd = openSync(outPath, "w");
    const errFd = openSync(errPath, "w");
    const started = Date.now();
    const timeoutMs = parsed.flags.timeout ? Number(parsed.flags.timeout) : 60 * 60 * 1000;
    // spawnSync(cwd) does NOT update the PWD/OLDPWD env vars, and agents
    // resolve their project root from PWD (verified 2026-09-07: `opencode run`
    // spawned with cwd=clone but PWD=<repo> created its session in the repo
    // and edited the real working tree). Pin PWD/OLDPWD to the clone and strip
    // the outer agent-session markers so the receiver sees a clean environment.
    const childEnv = { ...process.env };
    delete childEnv.OPENCODE;
    delete childEnv.OPENCODE_PID;
    delete childEnv.AGENT;
    // Never let a receiver touch the real Harnie home: pin HARNIE_HOME to a
    // disposable per-run directory so any receiver-initiated `harnie` call
    // (or stray HARNIE_HOME inherited from the outer session) lands in the
    // eval sandbox, never in ~/.harnie. Verified 2026-09-09 via the fake-agent
    // containment test in tests/eval-harness.test.ts.
    const sandboxHarnieHome = join(runDir, "harnie-home");
    mkdirSync(sandboxHarnieHome, { recursive: true });
    childEnv.HARNIE_HOME = sandboxHarnieHome;
    childEnv.PWD = cloneDir;
    childEnv.OLDPWD = cloneDir;
    const res = spawnSync(invocation[0], invocation.slice(1), {
      cwd: cloneDir,
      stdio: ["ignore", outFd, errFd],
      timeout: timeoutMs,
      env: childEnv,
    });
    closeSync(outFd);
    closeSync(errFd);
    const wallMs = Date.now() - started;
    const timedOut = res.error?.code === "ETIMEDOUT" || res.signal === "SIGTERM";

    const evidence = collectEvidence(dir, cloneDir, task, condHandoffPath, run);
    const result = {
      schema: RESULT_SCHEMA,
      runId: run.runId,
      taskId: task.id,
      condition,
      sourceHarness: condSourceHarness,
      targetHarness,
      tagSha: run.tagSha,
      refName: run.refName,
      handoffArtifactSha: evidence.handoff.sha256,
      patch: patchInfo,
      recordedAt: new Date().toISOString(),
      status: "ran",
      notRunReason: null,
      environment: {
        agent: agentName,
        agentVersion: agentArgv ? null : agentVersion(AGENTS[agentName].bin),
        model: parsed.flags.model ? String(parsed.flags.model) : null,
        node: run.node,
        platform: run.platform,
        ref: prep.head,
        clonePath: cloneDir,
      },
      handoff: evidence.handoff,
      execution: {
        invocation,
        exitCode: res.status,
        signal: res.signal || null,
        timedOut,
        wallMs,
        stdoutLog: outPath,
        stderrLog: errPath,
      },
      commandsRun: [],
      edits: {
        files: evidence.files,
        outOfScopeFiles: evidence.files.filter((f) => !task.files.includes(f)),
        diffChars: evidence.diffChars,
        diffPath: evidence.diffPath,
      },
      verification: { ran: null, commands: [], passed: null, details: "not attributable automatically — fill via record if observed" },
      metrics: emptyMetrics(),
      notes: null,
    };
    const resultPath = writeResult(dir, result);
    console.log(`[ran] ${task.id}/${condition} exit=${res.status} wallMs=${wallMs}${timedOut ? " TIMED OUT" : ""}`);
    console.log(`Result: ${resultPath}`);
  }
  return 0;
}

function cmdPrepare(parsed) {
  const taskId = parsed.flags.task;
  const task = TASKS.find((t) => t.id === taskId);
  if (!task) {
    console.error(`Unknown task "${taskId}". Available: ${TASKS.map((t) => t.id).join(", ")}`);
    return 1;
  }
  const runId = parsed.flags.run || `eval-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}-p${process.pid}`;
  const { runDir, run } = ensureRun({ repo: REPO_ROOT, refInput: parsed.flags.ref, runId });
  const conditions = parsed.flags.condition ? String(parsed.flags.condition).split(",") : CONDITIONS;
  for (const condition of conditions) {
    const dir = join(runDir, task.id, condition);
    mkdirSync(dir, { recursive: true });
    const cloneDir = join(dir, "clone");
    const prep = prepareClone({ repo: run.repo, ref: run.ref, dir: cloneDir });
    console.log(`${task.id}/${condition}: clone=${cloneDir} head=${prep.head}`);
  }
  return 0;
}

function cmdCollect(parsed) {
  const dir = parsed.flags.dir ? resolve(parsed.flags.dir) : null;
  if (!dir || !existsSync(join(dir, "clone"))) {
    console.error("collect requires --dir <condition dir> containing a clone/");
    return 1;
  }
  const resultPath = join(dir, "result.json");
  const result = existsSync(resultPath)
    ? JSON.parse(readFileSync(resultPath, "utf8"))
    : JSON.parse(readFileSync(join(dir, "result-template.json"), "utf8"));
  const run = JSON.parse(readFileSync(join(EVAL_ROOT, result.runId, "run.json"), "utf8"));
  const task = TASKS.find((t) => t.id === result.taskId);
  if (!task) {
    console.error(`result references unknown task ${result.taskId}`);
    return 1;
  }
  const handoffPath = result.handoff && result.handoff.path ? result.handoff.path : parsed.flags.handoff ? resolve(parsed.flags.handoff) : null;
  const evidence = collectEvidence(dir, join(dir, "clone"), task, handoffPath, run);
  result.edits = {
    files: evidence.files,
    outOfScopeFiles: evidence.files.filter((f) => !task.files.includes(f)),
    diffChars: evidence.diffChars,
    diffPath: evidence.diffPath,
  };
  result.handoff = evidence.handoff;
  result.handoffArtifactSha = evidence.handoff.sha256;
  const written = writeResult(dir, result);
  console.log(`Collected evidence into ${written}`);
  return 0;
}

function cmdRecord(parsed) {
  const dir = parsed.flags.dir ? resolve(parsed.flags.dir) : null;
  const file = parsed.flags.file ? resolve(parsed.flags.file) : null;
  if (!dir || !file) {
    console.error("record requires --dir <condition dir> and --file <result json>");
    return 1;
  }
  if (!existsSync(file)) {
    console.error(`File not found: ${file}`);
    return 1;
  }
  let result;
  try {
    result = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`Invalid JSON: ${e.message}`);
    return 1;
  }
  const { ok, errors } = validateResult(result);
  if (!ok) {
    console.error("Result failed schema validation:");
    for (const err of errors) console.error(`  - ${err}`);
    return 1;
  }
  const written = writeResult(dir, result);
  console.log(`Recorded: ${written}`);
  return 0;
}

function cmdSummarize(parsed) {
  const runId = parsed.flags.run;
  if (!runId) {
    console.error("summarize requires --run <run-id>");
    return 1;
  }
  const runDir = join(EVAL_ROOT, runId);
  if (!existsSync(runDir)) {
    console.error(`Run dir not found: ${runDir}`);
    return 1;
  }
  const run = JSON.parse(readFileSync(join(runDir, "run.json"), "utf8"));
  const rows = [];
  for (const task of TASKS) {
    for (const condition of CONDITIONS) {
      const resultPath = join(runDir, task.id, condition, "result.json");
      if (!existsSync(resultPath)) {
        rows.push({ taskId: task.id, condition, present: false, status: "missing" });
        continue;
      }
      const r = JSON.parse(readFileSync(resultPath, "utf8"));
      rows.push({
        taskId: task.id,
        condition,
        present: true,
        status: r.status,
        agent: r.environment?.agent ?? null,
        model: r.environment?.model ?? null,
        sourceHarness: r.sourceHarness ?? null,
        targetHarness: r.targetHarness ?? r.environment?.agent ?? null,
        tagSha: r.tagSha ?? run.tagSha ?? null,
        refName: r.refName ?? run.refName ?? null,
        handoffArtifactSha: r.handoffArtifactSha ?? r.handoff?.sha256 ?? null,
        timedOut: r.execution?.timedOut ?? null,
        exitCode: r.execution?.exitCode ?? null,
        filesEdited: r.edits?.files ?? [],
        outOfScopeFiles: r.edits?.outOfScopeFiles ?? [],
        verificationPassed: r.verification?.passed ?? null,
        repeatedFinishedEdits: r.metrics?.repeatedFinishedEdits ?? "unknown",
        falseCompletion: r.metrics?.falseCompletion ?? null,
        taskCompleted: r.metrics?.taskCompleted ?? null,
        // packageSizeChars must describe THIS condition's own handoff artifact.
        // Baseline rows get no handoff, so they must never inherit the handoff
        // condition's size (the 2026-09-07 summary bug); they report their own
        // measured value or null, rendered "N/A" in summary.md.
        packageSizeChars:
          r.condition === "handoff"
            ? (r.metrics?.packageSizeChars ?? (r.handoff?.chars ?? null))
            : (r.metrics?.packageSizeChars ?? null),
        notRunReason: r.notRunReason ?? null,
        notes: r.notes ?? null,
      });
    }
  }
  const summary = { schema: "harnie-eval-summary/v1", runId, ref: run.ref, node: run.node, platform: run.platform, rows };
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(summary, null, 2) + "\n");

  const md = [];
  md.push(`# Continuation evaluation summary — run ${runId}`);
  md.push("");
  md.push(`Ref: \`${run.refName}\` → \`${run.ref}\` · tagSha \`${run.tagSha}\` · Node: ${run.node} · Platform: ${run.platform} · Repo: ${run.repo}`);
  md.push("");
  md.push("| Task | Condition | Source→Target | Status | Agent | Model | tagSha | Handoff sha256 (first 12) | Exit | Files edited | Out-of-scope | Verification | Repeated finished edits | False completion | Completed | Handoff chars |");
  md.push("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const r of rows) {
    if (!r.present) {
      md.push(`| ${r.taskId} | ${r.condition} | | missing | | | | | | | | | | | | |`);
      continue;
    }
    const sizeCell =
      r.condition === "baseline" && r.packageSizeChars === null
        ? "N/A"
        : (r.packageSizeChars ?? "");
    const directed = r.sourceHarness ? `${r.sourceHarness}→${r.targetHarness}` : `baseline→${r.targetHarness}`;
    const sha12 = r.handoffArtifactSha ? r.handoffArtifactSha.slice(0, 12) : "";
    md.push(
      `| ${r.taskId} | ${r.condition} | ${directed} | ${r.status} | ${r.agent ?? ""} | ${r.model ?? ""} | ${r.tagSha ? String(r.tagSha).slice(0, 12) : ""} | ${sha12} | ${r.exitCode ?? ""}${r.timedOut ? " (timeout)" : ""} | ${r.filesEdited.join(", ")} | ${r.outOfScopeFiles.join(", ")} | ${r.verificationPassed ?? "unknown"} | ${r.repeatedFinishedEdits} | ${r.falseCompletion ?? "unknown"} | ${r.taskCompleted ?? "unknown"} | ${sizeCell} |`,
    );
  }
  md.push("");
  md.push("## Preview gate (initial)");
  md.push("");
  for (const task of TASKS) {
    const pair = rows.filter((r) => r.taskId === task.id && r.present);
    if (!pair.length) {
      md.push(`- ${task.id}: NOT RUN — no results recorded for this task`);
      continue;
    }
    const failures = [];
    for (const r of pair) {
      if (r.status !== "ran") failures.push(`${r.condition}: status=${r.status}${r.notRunReason ? ` (${r.notRunReason})` : ""}`);
      if (r.falseCompletion === true) failures.push(`${r.condition}: false completion reported`);
      if (r.repeatedFinishedEdits === "yes") failures.push(`${r.condition}: repeated finished edits`);
      if (r.verificationPassed === false) failures.push(`${r.condition}: verification failed`);
    }
    md.push(`- ${task.id}: ${failures.length ? `FAIL — ${failures.join("; ")}` : "no false completion / repeated finished edits evidenced (unknowns still need human review)"}`);
  }
  md.push("");
  writeFileSync(join(runDir, "summary.md"), md.join("\n") + "\n");
  console.log(md.join("\n"));
  return 0;
}

function cmdTasks(parsed) {
  if (parsed.flags.json) {
    console.log(JSON.stringify(TASKS, null, 2));
    return 0;
  }
  for (const t of TASKS) {
    console.log(`## ${t.id} (${t.area})`);
    console.log(`Statement: ${t.statement}`);
    console.log(`Details: ${t.details}`);
    console.log("Verify:");
    for (const v of t.verify) console.log(`  - ${v}`);
    console.log(`End state: ${t.endState}`);
    console.log(`Files: ${t.files.join(", ")}`);
    console.log("");
  }
  return 0;
}

const USAGE = `Usage: node scripts/eval-continuation.mjs <command> [flags]

Commands:
  tasks [--json]
      List the benchmark task registry.
  prepare --task <id> [--condition handoff,baseline] [--ref HEAD|worktree|<sha>] [--run <id>]
      Prepare disposable clones under ${EVAL_ROOT}.
  run --task <id> [--condition handoff|baseline|handoff,baseline] [--agent opencode|codex|pi]
      [--handoff <path>] [--model <provider/model>] [--agent-arg <arg>]...
      [--ref HEAD|worktree|<sha>] [--run <id>] [--timeout <ms>]
      [--source-harness pi|opencode|codex] [--target-harness <name>]
      [--patch <diff>] [--agent-command "<argv...>"]
      Prepare the clone(s), invoke the agent non-interactively (or fall back to
      manual-run mode), and record result.json with collected evidence.
      --source-harness records which harness produced the driver session
      (handoff condition only; baseline records null); --target-harness
      records the receiver harness (defaults to the agent). --patch applies a
      driver diff to the clone and commits it before the receiver runs
      (continuation-semantics tasks). The receiver environment pins PWD/OLDPWD
      to the clone and HARNIE_HOME to a per-run sandbox dir; ~/.harnie is never
      reachable. {prompt_text}, {prompt_file} and {clone} placeholders are
      supported in --agent-command / --agent-arg.
  collect --dir <condition dir>
      Re-collect git status/diff + handoff size into result.json.
  record --dir <condition dir> --file <result.json>
      Validate a filled result JSON and register it.
  summarize --run <run-id>
      Side-by-side handoff vs baseline summary (summary.md/json).
`;

function main(argv) {
  const parsed = parseArgs(argv);
  const cmd = parsed._[0];
  if (!cmd || cmd === "help" || parsed.flags.help) {
    process.stdout.write(USAGE);
    return cmd ? 0 : 1;
  }
  switch (cmd) {
    case "tasks":
      return cmdTasks(parsed);
    case "prepare":
      return cmdPrepare(parsed);
    case "run":
      return cmdRun(parsed);
    case "collect":
      return cmdCollect(parsed);
    case "record":
      return cmdRecord(parsed);
    case "summarize":
      return cmdSummarize(parsed);
    default:
      console.error(`Unknown command "${cmd}".\n`);
      process.stdout.write(USAGE);
      return 1;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  process.exitCode = main(process.argv.slice(2));
}
