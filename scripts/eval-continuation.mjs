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
  readdirSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve, relative, basename } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
// Exact candidate binding (2026-09-10 re-audit P2): verify-evidence re-resolves
// a run manifest's refName against a git repository and compares the peeled
// commit with the recorded tagSha. The repo defaults to the one this script
// lives in (so "run with cwd = repo root" and "run from anywhere" behave the
// same); --repo overrides it (used by tests with a throwaway repo).
//   strict  — immutable refs: tag names and 40-hex commit shas. A resolution
//             that disagrees with tagSha is an ERROR.
//   warning — anything else (HEAD, branches, unresolvable names): the binding
//             cannot be re-verified, and verify-evidence must say so loudly
//             instead of passing silently.
const EVAL_ROOT = process.env.HARNIE_EVAL_ROOT || join(tmpdir(), "opencode", "harnie-eval");
// Schema versioning (2026-09-10 re-audit remediation):
//   v1 — original results schema (archived 2026-09-07 / 2026-09-08 evidence);
//        no directed-matrix provenance fields required.
//   v2 — current generation; REQUIRES sourceHarness, targetHarness, tagSha,
//        refName, handoffArtifactSha; optional handoffGeneratedByRef /
//        handoffGeneratedBySha record which ref GENERATED a handoff artifact
//        when it differs from the evaluated candidate. `record` accepts both,
//        so archived v1 files stay validatable without rewriting history.
const RESULT_SCHEMA = "harnie-eval-result/v2";
const RESULT_SCHEMA_V1 = "harnie-eval-result/v1";
// Run manifest: v2 same shape as v1 except `repo` records the repo directory
// NAME (never a machine-local absolute path); the evaluated commit is already
// identified by refName + tagSha.
const RUN_SCHEMA = "harnie-eval-run/v2";
const RUN_SCHEMA_V1 = "harnie-eval-run/v1";
const CONDITIONS = ["handoff", "baseline"];
// Path convention in result records (2026-09-10): every file reference is
// relative to the directory containing result.json; references to evidence
// that intentionally lives only in the disposable tmp store are prefixed
// `disposable:` and are relative to the run dir. Machine-local absolute paths
// (/Users/..., /var/folders/...) must never appear in curated records —
// enforced by `verify-evidence`.

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
      "node dist/cli.js --version   # prints the version declared in package.json, exit 0",
      "npx vitest run tests/cli-init.test.ts   # still green",
    ],
    endState:
      "`node dist/cli.js --version` prints the version declared in package.json and exits 0; existing CLI behavior and the cli-init tests are unchanged.",
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
    files: ["docs/FIRST-RUN.md"],
    statement:
      "Document backup/restore recovery in the first-run walkthrough.",
    details:
      "Add a short '## Recovery' section to docs/FIRST-RUN.md covering: `harnie backup <path>` writes a consistent SQLite snapshot (0600), `harnie restore <path> --force` validates the backup and then overwrites the live store, and restore has no undo. Edit only that file; no code changes.",
    verify: [
      "grep -n '^## Recovery' docs/FIRST-RUN.md   # section exists",
      "git diff --stat   # only docs/FIRST-RUN.md modified",
    ],
    endState:
      "docs/FIRST-RUN.md has a Recovery section with backup/restore usage and the no-undo caveat; no other file is modified.",
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
//   grok 1.0.30      — `-p/--single <PROMPT>` is single-turn, prints the reply
//                      to stdout and exits (verified live 2026-09-13); `-m`
//                      selects the model; `--always-approve` auto-approves tool
//                      executions in headless mode.
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
  grok: {
    bin: "grok",
    args: ["-p", "{prompt_text}", "--always-approve"],
    modelArgs: ["-m", "{model}"],
    note: "grok -p (--single) is the documented non-interactive single-turn mode; --always-approve auto-approves tool executions. In the evaluator this scopes to the disposable clone only — do not treat it as a default for ordinary user runs.",
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
    "repo",
    "source-harness",
    "target-harness",
    "patch",
    "attest",
    "study",
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

const isNonEmptyStr = (v) => typeof v === "string" && v.length > 0;
const isHex64 = (v) => typeof v === "string" && /^[0-9a-f]{64}$/.test(v);
// handoffGeneratedBySha (2026-09-10 re-audit P2): canonically the 40-hex git
// commit sha of the ref that GENERATED the handoff artifact; a 64-hex sha256
// form (of the generated artifact bytes) is also accepted. Anything else —
// including short shas and prefixed values — is rejected.
const isHex40Or64 = (v) =>
  typeof v === "string" && (/^[0-9a-f]{40}$/.test(v) || isHex64(v));
const isFiniteNum = (v) => typeof v === "number" && Number.isFinite(v);
const parseIsoMs = (s) => {
  if (typeof s !== "string") return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
};
// runId-embedded execution stamp (2026-09-10 re-audit P2, chronology): the
// canonical run-id format is `eval-<YYYYMMDD>T<HHMM>[SS][-suffix]`, digits
// interpreted as UTC (the harness default derives the id from
// `new Date().toISOString()`; the curated dirs follow the same convention).
// Returns the encoded stamp in epoch-ms, or null when the id does not encode
// a calendar-valid UTC stamp (including hand-authored labels without one).
const RUN_ID_STAMP_RE = /^eval-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(?:-.*)?$/;
function runIdStampMs(runId) {
  if (typeof runId !== "string") return null;
  const m = RUN_ID_STAMP_RE.exec(runId);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  const month = Number(mo), day = Number(d), hour = Number(h), minute = Number(mi), sec = Number(s ?? "0");
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || sec > 59) return null;
  const ms = Date.UTC(Number(y), month - 1, day, hour, minute, sec);
  // Round-trip rejects impossible calendar dates (e.g. Feb 30) that Date.UTC
  // would silently roll over.
  if (!new Date(ms).toISOString().startsWith(`${y}-${mo}-${d}T${h}:${mi}`)) return null;
  return ms;
}
// Tolerances for the runId<->createdAt binding and the future-dating check
// (2026-09-10 re-audit P2): a small skew allowance for clock/imprecision
// between the id stamp and the manifest; anything beyond it in EITHER
// direction is an inconsistent timestamp.
const RUNID_TOL_MS = 10 * 60 * 1000;
const FUTURE_TOL_MS = 10 * 60 * 1000;

// Run-manifest validation (2026-09-10 re-audit P2): the v2 manifest is the
// anchor of the exact-candidate-binding and chronology checks, so a manifest
// missing or emptying any mandatory field would let a tampered record pass
// by leaving nothing to compare against. Every mandatory field must be
// PRESENT and NON-EMPTY: repo, ref, refName, tagSha (40-hex), createdAt
// (ISO), node, platform, and a non-empty `tasks` array of registered task
// ids. v2 additionally pins ref === tagSha (the resolved evaluated commit).
// Chronology binding (same re-audit): the runId must encode the execution
// timestamp (UTC) and agree with createdAt within +/-10 min — checked in
// BOTH directions — and createdAt must not be in the future relative to the
// verifier's live clock (future-dating at verification time is rejected).
export function validateRunV2(run, { now = Date.now() } = {}) {
  const errors = [];
  if (!run || typeof run !== "object") return { ok: false, errors: ["run manifest is not an object"] };
  if (run.schema !== RUN_SCHEMA) errors.push(`schema must be "${RUN_SCHEMA}"`);
  for (const key of ["runId", "repo", "ref", "refName", "createdAt", "node", "platform"]) {
    if (!isNonEmptyStr(run[key])) errors.push(`${key} must be a non-empty string`);
  }
  if (isNonEmptyStr(run.repo) && run.repo.startsWith("/")) {
    errors.push("repo must not be an absolute path (v2 convention: repo name)");
  }
  if (!/^[0-9a-f]{40}$/.test(run.tagSha ?? "")) {
    errors.push("tagSha must be a resolved 40-hex commit sha (required in v2)");
  }
  if (isNonEmptyStr(run.ref) && /^[0-9a-f]{40}$/.test(run.tagSha ?? "") && run.ref !== run.tagSha) {
    errors.push("ref must equal tagSha (v2: the resolved evaluated commit)");
  }
  if (isNonEmptyStr(run.createdAt) && parseIsoMs(run.createdAt) === null) {
    errors.push("createdAt must be an ISO timestamp");
  }
  if (!Array.isArray(run.tasks) || run.tasks.length === 0) {
    errors.push("tasks must be a non-empty array of registered task ids");
  } else {
    run.tasks.forEach((t, i) => {
      if (!isNonEmptyStr(t)) errors.push(`tasks[${i}] must be a non-empty string`);
      else if (!TASKS.some((task) => task.id === t)) {
        errors.push(`tasks[${i}] ${JSON.stringify(t)} is not a registered task id`);
      }
    });
  }
  const createdAtMs = parseIsoMs(run.createdAt);
  if (createdAtMs !== null) {
    if (createdAtMs > now + FUTURE_TOL_MS) {
      errors.push(
        `createdAt ${run.createdAt} is in the future relative to the verifier clock (future-dated manifest)`,
      );
    }
    const stampMs = runIdStampMs(run.runId);
    if (stampMs === null) {
      errors.push(
        `runId ${JSON.stringify(run.runId)} does not encode a UTC execution timestamp of the form eval-<YYYYMMDD>T<HHMM>[SS][-suffix] — chronology cannot be bound to the run id`,
      );
    } else if (Math.abs(stampMs - createdAtMs) > RUNID_TOL_MS) {
      const direction = stampMs > createdAtMs ? "after" : "before";
      errors.push(
        `runId ${JSON.stringify(run.runId)} encodes a stamp more than 10 min ${direction} the manifest createdAt ${run.createdAt} (runId/createdAt binding)`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

// v2 nested-field spec (2026-09-10 re-audit): every field the schema documents
// must be present, with the documented type. `null` is allowed where the
// schema allows unknown/absent evidence (honest "not observed" is valid;
// a MISSING key or a wrong-typed value is not). `required` fields must be
// non-null regardless of status.
const V2_NESTED_SPEC = {
  environment: {
    agent: { type: "string", required: true },
    agentVersion: { type: "string" },
    model: { type: "string" },
    node: { type: "string" },
    platform: { type: "string" },
    ref: { type: "string", required: true },
    clonePath: { type: "string" },
  },
  handoff: {
    path: { type: "string" },
    chars: { type: "number" },
    sha256: { type: "string" },
  },
  execution: {
    invocation: { type: "array" },
    exitCode: { type: "number" },
    signal: { type: "string" },
    timedOut: { type: "boolean" },
    wallMs: { type: "number" },
    stdoutLog: { type: "string" },
    stderrLog: { type: "string" },
  },
  verification: {
    ran: { type: "boolean" },
    commands: { type: "array", required: true },
    passed: { type: "boolean" },
    details: { type: "string" },
  },
  edits: {
    files: { type: "array", required: true },
    outOfScopeFiles: { type: "array" },
    diffChars: { type: "number" },
    diffPath: { type: "string" },
  },
};

function checkV2NestedFields(r, errors) {
  for (const [objName, spec] of Object.entries(V2_NESTED_SPEC)) {
    const obj = r[objName];
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) continue;
    for (const [key, rule] of Object.entries(spec)) {
      if (!(key in obj)) {
        errors.push(`${objName}.${key} must be present (documented field; null allowed where unknown)`);
        continue;
      }
      const v = obj[key];
      if (v === null) {
        if (rule.required) errors.push(`${objName}.${key} must be a non-null ${rule.type}`);
        continue;
      }
      const typeOk =
        rule.type === "string" ? typeof v === "string"
        : rule.type === "number" ? isFiniteNum(v)
        : rule.type === "boolean" ? typeof v === "boolean"
        : Array.isArray(v);
      if (!typeOk) errors.push(`${objName}.${key} must be a ${rule.type} or null`);
      else if (rule.required && rule.type === "string" && !isNonEmptyStr(v)) {
        errors.push(`${objName}.${key} must be a non-empty string`);
      }
    }
  }
}

export function validateCoreResult(r, { requireProvenance, strict = false }) {
  const errors = [];
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
  if (r.status === "not-run" && !isNonEmptyStr(r.notRunReason)) {
    errors.push('status "not-run" requires a non-empty notRunReason');
  }
  if (strict) checkV2NestedFields(r, errors);
  if (requireProvenance) {
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
    if (r.handoffArtifactSha !== null && !isHex64(r.handoffArtifactSha ?? "")) {
      errors.push("handoffArtifactSha must be a 64-hex sha256 or null");
    }
    // v2 records must bind environment.ref to the evaluated commit: required,
    // non-null, and the 40-hex sha of the ref the receiver actually ran on
    // (2026-09-10 re-audit P2 closure: a null environment.ref used to pass).
    if (typeof r.environment?.ref !== "string" || !/^[0-9a-f]{40}$/.test(r.environment.ref)) {
      errors.push("environment.ref must be a 40-hex commit sha (required and non-null in v2 records)");
    }
  }
  // Optional handoff-generation provenance (2026-09-10 re-audit P2): identifies
  // which ref GENERATED a handoff artifact when that ref differs from the
  // evaluated candidate (e.g. an artifact rendered under rc.2 and consumed by
  // an rc.5-bound leg). Validated whenever present, regardless of schema
  // version; null/absent means the generating ref equals the candidate or is
  // unknown. See EVALUATION-PROTOCOL.md §4. The two fields are PAIRED: they
  // must be both null/absent or both present — a half-filled provenance pair
  // is rejected, not merely syntax-checked (2026-09-10 re-audit P2 closure).
  const genRefSet = r.handoffGeneratedByRef !== undefined && r.handoffGeneratedByRef !== null;
  const genShaSet = r.handoffGeneratedBySha !== undefined && r.handoffGeneratedBySha !== null;
  if (genRefSet && !isNonEmptyStr(r.handoffGeneratedByRef)) {
    errors.push("handoffGeneratedByRef must be a non-empty string or null");
  }
  if (genShaSet && !isHex40Or64(r.handoffGeneratedBySha)) {
    errors.push("handoffGeneratedBySha must be a 40-hex commit sha, a 64-hex sha256, or null");
  }
  if (genRefSet !== genShaSet) {
    errors.push(
      "handoffGeneratedByRef and handoffGeneratedBySha must be paired (both null/absent or both present)",
    );
  }
  if (strict) {
    // Condition invariants (2026-09-10 re-audit): the condition, the provenance
    // and the handoff block must agree — no contradictory or half-filled
    // provenance.
    if (r.condition === "baseline") {
      if (r.sourceHarness !== null) {
        errors.push('condition "baseline" requires sourceHarness null (no driver session exists)');
      }
      if (r.handoffArtifactSha !== null) {
        errors.push('condition "baseline" requires handoffArtifactSha null');
      }
      if (
        r.handoff?.path !== null || r.handoff?.chars !== null || r.handoff?.sha256 !== null
      ) {
        errors.push('condition "baseline" requires handoff.path, handoff.chars and handoff.sha256 all null');
      }
      // A baseline consumes no handoff artifact, so it cannot name a generating
      // ref either (exact-candidate-binding remediation, 2026-09-10).
      if (r.handoffGeneratedByRef !== undefined && r.handoffGeneratedByRef !== null) {
        errors.push('condition "baseline" requires handoffGeneratedByRef null (no handoff artifact exists)');
      }
      if (r.handoffGeneratedBySha !== undefined && r.handoffGeneratedBySha !== null) {
        errors.push('condition "baseline" requires handoffGeneratedBySha null (no handoff artifact exists)');
      }
    }
    if (r.condition === "handoff") {
      if (!isNonEmptyStr(r.sourceHarness)) {
        errors.push('condition "handoff" requires a non-empty sourceHarness (the driver harness)');
      }
      if (!isHex64(r.handoffArtifactSha ?? "")) {
        errors.push('condition "handoff" requires handoffArtifactSha (64-hex sha256 of the consumed artifact)');
      }
      if (!isNonEmptyStr(r.handoff?.path ?? null)) {
        errors.push('condition "handoff" requires a non-empty handoff.path');
      }
      if (!isFiniteNum(r.handoff?.chars)) {
        errors.push('condition "handoff" requires handoff.chars (measured package size)');
      }
      if (!isHex64(r.handoff?.sha256 ?? "")) {
        errors.push('condition "handoff" requires handoff.sha256 (64-hex)');
      } else if (r.handoff.sha256 !== r.handoffArtifactSha) {
        errors.push("handoff.sha256 must equal handoffArtifactSha");
      }
    }
    if (r.status === "ran" && r.condition === "handoff") {
      // Release-qualifying run (2026-09-10 re-audit P2 closure): a completed
      // handoff-conditioned leg must have consumed an artifact GENERATED BY
      // THE SAME CANDIDATE — handoffGeneratedBySha must be present and equal
      // the evaluated tagSha. Older artifacts are allowed only for
      // non-qualifying records (status "not-run"/manual, baseline, or
      // archived v1); those must carry their non-qualifying status explicitly
      // (status/condition/schema already do) instead of inheriting a waiver.
      if (r.handoffGeneratedBySha === undefined || r.handoffGeneratedBySha === null) {
        errors.push(
          'release-qualifying record (status "ran", condition "handoff") requires handoffGeneratedBySha === tagSha; older artifacts are allowed only for non-qualifying records',
        );
      } else if (r.handoffGeneratedBySha !== r.tagSha) {
        errors.push(
          'handoffGeneratedBySha must equal tagSha for a release-qualifying record (status "ran", condition "handoff"); older artifacts are allowed only for non-qualifying records',
        );
      }
    }
    if (r.status === "ran") {
      const e = r.execution ?? {};
      if (!Array.isArray(e.invocation) || e.invocation.length === 0) {
        errors.push('status "ran" requires execution.invocation to be a non-empty array');
      }
      if (!isNonEmptyStr(e.stdoutLog) || !isNonEmptyStr(e.stderrLog)) {
        errors.push('status "ran" requires execution.stdoutLog and execution.stderrLog');
      }
      // A timed-out/killed run exits via signal with exitCode null; require
      // exitCode OR an honest kill marker.
      if (!isFiniteNum(e.exitCode) && e.timedOut !== true && e.signal === null) {
        errors.push('status "ran" requires execution.exitCode (number), or signal/timedOut for a killed run');
      }
      if (!isFiniteNum(e.wallMs)) {
        errors.push('status "ran" requires execution.wallMs (number)');
      }
    }
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

// v1 validator: archived 2026-09-07 / 2026-09-08 results. Same core shape, but
// the directed-matrix provenance fields are NOT required (they did not exist)
// and nested fields are not strictly checked (archived evidence stays
// validatable without rewriting it).
export function validateResultV1(r) {
  if (!r || typeof r !== "object") return { ok: false, errors: ["result is not an object"] };
  if (r.schema !== RESULT_SCHEMA_V1) {
    return { ok: false, errors: [`schema must be "${RESULT_SCHEMA_V1}"`] };
  }
  return validateCoreResult(r, { requireProvenance: false, strict: false });
}

// v2 validator: current generation; provenance is mandatory and every
// documented nested field + the condition invariants (baseline ⇒ no handoff
// provenance; handoff ⇒ complete, self-consistent provenance) are enforced.
export function validateResultV2(r) {
  if (!r || typeof r !== "object") return { ok: false, errors: ["result is not an object"] };
  if (r.schema !== RESULT_SCHEMA) {
    return { ok: false, errors: [`schema must be "${RESULT_SCHEMA}"`] };
  }
  return validateCoreResult(r, { requireProvenance: true, strict: true });
}

// Dispatch on the record's declared `schema` field. `record` accepts both, so
// archived v1 evidence can be re-registered without rewriting it to v2.
export function validateResult(r) {
  if (!r || typeof r !== "object") return { ok: false, errors: ["result is not an object"] };
  if (r.schema === RESULT_SCHEMA_V1) return validateResultV1(r);
  if (r.schema === RESULT_SCHEMA) return validateResultV2(r);
  return {
    ok: false,
    errors: [`schema must be "${RESULT_SCHEMA_V1}" or "${RESULT_SCHEMA}"`],
  };
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

function ensureRun({ repo, refInput, runId, attest, study }) {
  const runDir = join(EVAL_ROOT, runId);
  const runJsonPath = join(runDir, "run.json");
  if (existsSync(runJsonPath)) {
    const run = JSON.parse(readFileSync(runJsonPath, "utf8"));
    if (study && run.study !== String(study)) {
      throw new Error(`run ${runId} is not enrolled in study ${study}; create a fresh run id`);
    }
    return { runDir, run };
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
    schema: RUN_SCHEMA,
    runId,
    // v2: repo is recorded as the repo directory NAME, never a machine-local
    // absolute path (the evaluated commit is identified by refName + tagSha).
    repo: basename(repo),
    ref: tagSha ?? ref,
    refName,
    tagSha,
    refInput: refInput || "HEAD",
    createdAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    tasks: TASKS.map((t) => t.id),
  };
  // A named study binds future evidence to a protocol declared before the
  // runs were collected. Historical evidence remains useful for exploration,
  // but cannot silently become confirmatory after thresholds are chosen.
  if (study) run.study = String(study);
  // Execution-time attestation (--attest, 2026-09-10 re-audit P2): when the
  // operator passes --attest <string>, capture it — plus the GitHub Actions
  // environment when present — into the manifest, ONCE at manifest-creation
  // time. Self-recorded provenance, not a cryptographic attestation; see
  // EVALUATION-PROTOCOL.md §4 for the narrowed guarantee.
  if (attest) {
    const attestation = {
      source: process.env.GITHUB_RUN_ID ? "github-actions" : "provided",
      attestation: String(attest),
      capturedAt: new Date().toISOString(),
    };
    if (process.env.GITHUB_RUN_ID) attestation.githubRunId = process.env.GITHUB_RUN_ID;
    if (process.env.GITHUB_REPOSITORY) attestation.githubRepository = process.env.GITHUB_REPOSITORY;
    if (process.env.GITHUB_ACTOR) attestation.githubActor = process.env.GITHUB_ACTOR;
    run.attestation = attestation;
  }
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
    // Manual-mode skeleton is non-qualifying (status "manual"/"not-run"),
    // so the generating provenance stays explicitly null (both fields paired).
    handoffGeneratedByRef: null,
    handoffGeneratedBySha: null,
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
    execution: { invocation: null, exitCode: null, signal: null, timedOut: null, wallMs: null, stdoutLog: null, stderrLog: null },
    commandsRun: [],
    edits: { files: [], outOfScopeFiles: [], diffChars: null, diffPath: "edits.diff" },
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
   lines.push("   missingOrFalseContext, taskCompleted, falseCompletion. Set status to \"ran\" and recordedAt to the");
   lines.push("   live clock value at fill time (`date -u +%FT%T.%3NZ`). Never hand-author a date: verify-evidence");
   lines.push("   rejects recordedAt values that do not match the run's actual chronology.");
  lines.push("   Do NOT guess: leave \"unknown\"/null if you did not observe it.");
  lines.push("5. Register the result:");
   lines.push(`   node scripts/eval-continuation.mjs record --dir ${dir} --file result.json`);
   if (condition === "handoff") {
     lines.push("   For a handoff-condition record, fill sourceHarness (the driver harness: pi|opencode|codex) —");
     lines.push("   record rejects handoff-condition records without it and without the measured handoff block.");
   }
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
  const { runDir, run } = ensureRun({
    repo: REPO_ROOT,
    refInput: parsed.flags.ref,
    runId,
    attest: parsed.flags.attest,
    study: parsed.flags.study,
  });
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
    // prepareClone needs the real repo path (run.repo only records the name).
    const prep = prepareClone({ repo: REPO_ROOT, ref: run.ref, dir: cloneDir });
    // Store the patch reference relative to the result dir (path convention:
    // no machine-local absolute paths in records).
    const patchInfo = patchPath
      ? { ...applyDriverPatch(cloneDir, patchPath), path: relative(dir, patchPath) }
      : null;
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
      const template = resultTemplate({ task, condition, run, dirName: cloneDir, handoffPath: condHandoffPath, sourceHarness: condSourceHarness, targetHarness });
      // Path convention applies in manual mode too.
      template.environment.clonePath = `disposable:${relative(runDir, cloneDir)}`;
      template.handoff.path = condHandoffPath ? relative(dir, condHandoffPath) : null;
      // Measure the ready handoff artifact into the skeleton (size + sha256 are
      // measurement, not fabrication); collect re-derives them later. A
      // handoff-condition skeleton without a declared driver/artifact stays
      // INVALID until the human fills it — strict v2 invariants reject it.
      if (condHandoffPath && existsSync(condHandoffPath)) {
        template.handoff.chars = readFileSync(condHandoffPath).length;
        template.handoff.sha256 = sha256File(condHandoffPath);
        template.handoffArtifactSha = template.handoff.sha256;
      }
      writeFileSync(join(dir, "result-template.json"), JSON.stringify(template, null, 2) + "\n");
      const result = {
        ...template,
        patch: patchInfo,
        status: "manual",
        recordedAt: new Date().toISOString(),
        notRunReason: "no agent CLI available/selected; manual-run mode — see manual-instructions.md",
      };
      result.handoffArtifactSha = template.handoff.sha256;
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
    // Path convention: records store paths relative to the result dir; the
    // disposable clone is prefixed `disposable:` (relative to the run dir);
    // invocation[0] records the binary NAME, never its absolute path.
    const recordedInvocation = [basename(String(invocation[0])), ...invocation.slice(1)];
    const result = {
      schema: RESULT_SCHEMA,
      runId: run.runId,
      taskId: task.id,
      condition,
      sourceHarness: condSourceHarness,
      targetHarness,
      tagSha: run.tagSha,
      refName: run.refName,
      // Handoff-generation provenance (2026-09-10 re-audit P2 closure): a
      // status "ran" handoff-conditioned record is release-qualifying and must
      // pin the generating sha to the evaluated candidate. The harness records
      // the run's own refName/tagSha (the operator's declared rendering ref);
      // an artifact actually rendered by an older build cannot be registered
      // as a ran+handoff record — the schema rejects the mismatch. A baseline
      // consumes no artifact and carries the explicit null pair.
      handoffGeneratedByRef: condition === "handoff" ? run.refName : null,
      handoffGeneratedBySha: condition === "handoff" ? run.tagSha : null,
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
        clonePath: `disposable:${relative(runDir, cloneDir)}`,
      },
      handoff: {
        ...evidence.handoff,
        path: condHandoffPath ? relative(dir, condHandoffPath) : null,
      },
      execution: {
        invocation: recordedInvocation,
        exitCode: res.status,
        signal: res.signal || null,
        timedOut,
        wallMs,
        stdoutLog: relative(dir, outPath),
        stderrLog: relative(dir, errPath),
      },
      commandsRun: [],
      edits: {
        files: evidence.files,
        outOfScopeFiles: evidence.files.filter((f) => !task.files.includes(f)),
        diffChars: evidence.diffChars,
        diffPath: evidence.diffPath ? relative(dir, evidence.diffPath) : null,
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
  const { runDir, run } = ensureRun({
    repo: REPO_ROOT,
    refInput: parsed.flags.ref,
    runId,
    attest: parsed.flags.attest,
    study: parsed.flags.study,
  });
  const conditions = parsed.flags.condition ? String(parsed.flags.condition).split(",") : CONDITIONS;
  for (const condition of conditions) {
    const dir = join(runDir, task.id, condition);
    mkdirSync(dir, { recursive: true });
    const cloneDir = join(dir, "clone");
    const prep = prepareClone({ repo: REPO_ROOT, ref: run.ref, dir: cloneDir });
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
  const handoffPath = result.handoff && result.handoff.path
    ? resolve(dir, result.handoff.path)
    : parsed.flags.handoff
      ? resolve(parsed.flags.handoff)
      : null;
  const evidence = collectEvidence(dir, join(dir, "clone"), task, handoffPath, run);
  result.edits = {
    files: evidence.files,
    outOfScopeFiles: evidence.files.filter((f) => !task.files.includes(f)),
    diffChars: evidence.diffChars,
    diffPath: evidence.diffPath ? relative(dir, evidence.diffPath) : null,
  };
  result.handoff = {
    ...evidence.handoff,
    path: handoffPath ? relative(dir, handoffPath) : null,
  };
  result.handoffArtifactSha = evidence.handoff.sha256;
  // Normalize a machine-local absolute clonePath to the disposable: convention.
  if (typeof result.environment?.clonePath === "string" && result.environment.clonePath.startsWith("/")) {
    result.environment.clonePath = `disposable:${relative(dirname(dirname(dir)), result.environment.clonePath)}`;
  }
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

// Shared summary generation (2026-09-10 re-audit P2): the canonical summary is
// built by ONE code path, used by `summarize` (to write it) and by
// `verify-evidence` (to regenerate it from a curated run dir and compare with
// the committed summary.json — summary drift = error). Exported so the test
// fixtures build their committed summaries with the same code.
function collectSummaryRows(runDir) {
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
        tagSha: r.tagSha ?? run?.tagSha ?? null,
        refName: r.refName ?? run?.refName ?? null,
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
  return rows;
}

function renderSummaryMd(run, rows) {
  const md = [];
  md.push(`# Continuation evaluation summary — run ${run.runId}`);
  md.push("");
  md.push(`Ref: \`${run.refName ?? "unknown"}\` → \`${run.ref ?? "unknown"}\` · tagSha \`${run.tagSha ?? "unknown"}\` · Node: ${run.node ?? "unknown"} · Platform: ${run.platform ?? "unknown"} · Repo: ${run.repo ?? "unknown"}`);
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
  return md;
}

export function generateSummary(runDir, run) {
  const rows = collectSummaryRows(runDir, run);
  const data = {
    schema: "harnie-eval-summary/v1",
    runId: run.runId,
    ref: run.ref,
    node: run.node,
    platform: run.platform,
    rows,
  };
  return { data, md: renderSummaryMd(run, rows).join("\n") + "\n" };
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
  const { data, md } = generateSummary(runDir, run);
  writeFileSync(join(runDir, "summary.json"), JSON.stringify(data, null, 2) + "\n");
  writeFileSync(join(runDir, "summary.md"), md);
  console.log(md);
  return 0;
}

// Confirmatory productivity study v1. These thresholds are intentionally
// declared in code/protocol before new trials are collected. Wall time is
// reported as an exploratory operational measure; it is too provider- and
// machine-sensitive to stand in for developer re-explanation.
export const PRODUCTIVITY_STUDY = Object.freeze({
  id: "productivity-v1",
  minimumPairs: 10,
  minimumTasks: 3,
  minimumTargets: 2,
  minimumPairsPerTarget: 3,
  primaryMinimumImprovedShare: 0.7,
  primaryMaximumWorsenedShare: 0.1,
  primaryMinimumMedianCategoryReduction: 1,
});

const explanationScore = { none: 0, partial: 1, full: 2 };
const investigationScore = { none: 0, partial: 1, full: 2 };

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

const pairKey = (result) => [
  result.runId,
  result.taskId,
  result.targetHarness ?? result.environment?.agent ?? "unknown",
  result.environment?.model ?? "default",
  result.tagSha ?? "unknown",
].join("\u0000");

export function aggregateProductivity(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const result = entry.result ?? entry;
    const key = pairKey(result);
    const group = groups.get(key) ?? { run: entry.run ?? null, results: {} };
    group.results[result.condition] = result;
    if (!group.run && entry.run) group.run = entry.run;
    groups.set(key, group);
  }

  const pairs = [];
  for (const group of groups.values()) {
    const handoff = group.results.handoff;
    const baseline = group.results.baseline;
    const sample = handoff ?? baseline;
    const reasons = [];
    if (!handoff) reasons.push("missing handoff condition");
    if (!baseline) reasons.push("missing baseline condition");
    for (const [name, result] of [["handoff", handoff], ["baseline", baseline]]) {
      if (!result) continue;
      if (result.status !== "ran") reasons.push(`${name} status=${result.status}`);
      if (result.verification?.passed !== true) reasons.push(`${name} verification did not pass`);
      if (result.metrics?.taskCompleted !== true) reasons.push(`${name} task completion not established`);
      if (result.metrics?.falseCompletion === true) reasons.push(`${name} false completion`);
      if (result.metrics?.repeatedFinishedEdits === "yes") reasons.push(`${name} repeated finished edits`);
      if ((result.edits?.outOfScopeFiles?.length ?? 0) > 0) reasons.push(`${name} out-of-scope edits`);
    }
    const confirmatory = group.run?.study === PRODUCTIVITY_STUDY.id;
    const explanationDelta = handoff && baseline &&
      explanationScore[handoff.metrics?.developerReExplanation] !== undefined &&
      explanationScore[baseline.metrics?.developerReExplanation] !== undefined
      ? explanationScore[handoff.metrics.developerReExplanation] - explanationScore[baseline.metrics.developerReExplanation]
      : null;
    const investigationDelta = handoff && baseline &&
      investigationScore[handoff.metrics?.repeatedInvestigation] !== undefined &&
      investigationScore[baseline.metrics?.repeatedInvestigation] !== undefined
      ? investigationScore[handoff.metrics.repeatedInvestigation] - investigationScore[baseline.metrics.repeatedInvestigation]
      : null;
    const baselineWall = baseline?.execution?.wallMs;
    const handoffWall = handoff?.execution?.wallMs;
    const wallRelativeDelta = Number.isFinite(baselineWall) && baselineWall > 0 && Number.isFinite(handoffWall)
      ? (handoffWall - baselineWall) / baselineWall
      : null;
    pairs.push({
      runId: sample?.runId ?? group.run?.runId ?? null,
      taskId: sample?.taskId ?? null,
      targetHarness: sample?.targetHarness ?? sample?.environment?.agent ?? null,
      model: sample?.environment?.model ?? null,
      tagSha: sample?.tagSha ?? null,
      confirmatory,
      eligible: confirmatory && reasons.length === 0,
      exclusionReasons: confirmatory ? reasons : ["run manifest is not enrolled in study productivity-v1"],
      explanationDelta,
      investigationDelta,
      wallRelativeDelta,
    });
  }

  const confirmatoryPairs = pairs.filter((pair) => pair.confirmatory);
  const eligiblePairs = confirmatoryPairs.filter((pair) => pair.eligible);
  const scored = eligiblePairs.filter((pair) => pair.explanationDelta !== null);
  const targets = new Map();
  for (const pair of eligiblePairs) targets.set(pair.targetHarness, (targets.get(pair.targetHarness) ?? 0) + 1);
  const explanationDeltas = scored.map((pair) => pair.explanationDelta);
  const improved = explanationDeltas.filter((delta) => delta < 0).length;
  const worsened = explanationDeltas.filter((delta) => delta > 0).length;
  const improvedShare = scored.length ? improved / scored.length : null;
  const worsenedShare = scored.length ? worsened / scored.length : null;
  const medianExplanationDelta = median(explanationDeltas);
  const coverage = {
    pairs: eligiblePairs.length >= PRODUCTIVITY_STUDY.minimumPairs,
    tasks: new Set(eligiblePairs.map((pair) => pair.taskId)).size >= PRODUCTIVITY_STUDY.minimumTasks,
    targets: targets.size >= PRODUCTIVITY_STUDY.minimumTargets,
    pairsPerTarget: targets.size >= PRODUCTIVITY_STUDY.minimumTargets &&
      [...targets.values()].every((count) => count >= PRODUCTIVITY_STUDY.minimumPairsPerTarget),
    allConfirmatoryPairsEligible: confirmatoryPairs.length > 0 && eligiblePairs.length === confirmatoryPairs.length,
    allEligiblePairsScored: eligiblePairs.length > 0 && scored.length === eligiblePairs.length,
  };
  const primary = {
    improvedShare,
    worsenedShare,
    medianCategoryDelta: medianExplanationDelta,
    passes: improvedShare !== null &&
      improvedShare >= PRODUCTIVITY_STUDY.primaryMinimumImprovedShare &&
      worsenedShare <= PRODUCTIVITY_STUDY.primaryMaximumWorsenedShare &&
      medianExplanationDelta <= -PRODUCTIVITY_STUDY.primaryMinimumMedianCategoryReduction,
  };
  const passes = Object.values(coverage).every(Boolean) && primary.passes;
  return {
    schema: "harnie-productivity-assessment/v1",
    study: PRODUCTIVITY_STUDY,
    verdict: passes ? "ESTABLISHED" : "NOT_ESTABLISHED",
    counts: {
      discoveredPairs: pairs.length,
      confirmatoryPairs: confirmatoryPairs.length,
      eligiblePairs: eligiblePairs.length,
      primaryScoredPairs: scored.length,
      tasks: new Set(eligiblePairs.map((pair) => pair.taskId)).size,
      targets: Object.fromEntries(targets),
    },
    coverage,
    primary,
    secondary: {
      medianInvestigationCategoryDelta: median(eligiblePairs.map((pair) => pair.investigationDelta).filter((v) => v !== null)),
      medianWallRelativeDelta: median(eligiblePairs.map((pair) => pair.wallRelativeDelta).filter((v) => v !== null)),
      wallTimeIsExploratory: true,
    },
    pairs,
  };
}

function findProductivityEntries(root) {
  const entries = [];
  const visit = (dir) => {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, item.name);
      if (item.isDirectory()) visit(path);
      else if (item.name === "result.json") {
        const result = JSON.parse(readFileSync(path, "utf8"));
        let cursor = dirname(path);
        let run = null;
        while (cursor.startsWith(resolve(root))) {
          const manifest = join(cursor, "run.json");
          if (existsSync(manifest)) {
            run = JSON.parse(readFileSync(manifest, "utf8"));
            break;
          }
          const parent = dirname(cursor);
          if (parent === cursor) break;
          cursor = parent;
        }
        entries.push({ result, run, path });
      }
    }
  };
  visit(resolve(root));
  return entries;
}

function cmdQualifyProductivity(parsed) {
  const dir = parsed.flags.dir;
  if (!dir || !existsSync(resolve(dir))) {
    console.error("qualify-productivity requires --dir <eval evidence root>");
    return 1;
  }
  const assessment = aggregateProductivity(findProductivityEntries(dir));
  process.stdout.write(JSON.stringify(assessment, null, 2) + "\n");
  return 0;
}

// Integrity check over a curated eval directory (docs/research/eval-<date>/).
// Verifies, per the 2026-09-10 re-audit: every referenced file exists; handoff
// artifact hashes match; every result belongs to its run dir; every run dir
// has run.json + summary.{md,json}; no machine-local absolute paths remain in
// curated records; the EXACT CANDIDATE BINDING holds (record tagSha/refName/
// environment.ref equal the run manifest's, and a tag/commit refName re-resolves
// in git to the recorded tagSha); and the committed summary.json matches a
// harness regeneration of the same run dir (summary drift = error; --fix
// rewrites summary.{md,json} from the canonical generation). Raw receiver logs
// are evidence and are never rewritten, so the machine-path check applies to
// the structured records only.
const stableStringify = (v) => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(",")}}`;
};

function cmdVerifyEvidence(parsed) {
  const evalDir = parsed.flags.dir ? resolve(parsed.flags.dir) : null;
  if (!evalDir || !existsSync(join(evalDir, "runs"))) {
    console.error("verify-evidence requires --dir <curated eval dir> containing runs/");
    return 1;
  }
  const fixMode = parsed.flags.fix === true;
  // Archival mode (2026-09-10 re-audit remediation): explicit opt-in for the
  // pre-manifest (v1-era) curated dirs (eval-2026-09-07 / eval-2026-09-08).
  // Their records carry machine-local tmp paths and no run manifests — the
  // conventions that postdate them are downgraded to LOUD WARNINGS here, while
  // schema validation, file resolution, hash verification and the eval-root
  // README/summary existence checks remain errors. Default (strict) mode is
  // unchanged: anything v2 must pass everything.
  const archivalMode = parsed.flags.archival === true;
  const repoDir = parsed.flags.repo ? resolve(String(parsed.flags.repo)) : REPO_ROOT;
  const problems = [];
  const warnings = [];
  const problem = (msg, { archival = false } = {}) => {
    if (archivalMode && archival) warnings.push(`warning (archival mode): ${msg}`);
    else problems.push(msg);
  };
  // Git re-resolution helpers for the exact-candidate-binding check. Both fail
  // soft (return null) so a missing git binary or repo yields a WARNING, never
  // a crash and never a silent pass.
  const resolveGitCommit = (refName) => {
    try {
      return (
        execFileSync(
          "git",
          ["-C", repoDir, "rev-parse", "--verify", "--quiet", `${refName}^{commit}`],
          { encoding: "utf8" },
        ).trim() || null
      );
    } catch {
      return null;
    }
  };
  const isTagRef = (refName) => {
    try {
      execFileSync("git", ["-C", repoDir, "rev-parse", "--verify", "--quiet", `refs/tags/${refName}`], {
        encoding: "utf8",
      });
      return true;
    } catch {
      return false;
    }
  };
  const hasLocalPath = (s) => typeof s === "string" && (s.includes("/Users/") || s.includes("/var/folders/"));
  // Chronology rules (2026-09-10 re-audit): the harness emits all timestamps
  // from the live clock at run time; hand-authored dates are rejected.
  // Tolerances: 1h skew allowance against the run manifest and the newest file
  // mtime inside the run dir (mtimes on a fresh checkout are checkout-time, so
  // only a recordedAt/createdAt claiming a time LONGER than 1h after every
  // file's actual last write is a fabricated date). The runId<->createdAt
  // binding (+/-10 min, both directions) and the live-clock future check live
  // in validateRunV2; the manifest-level guarantee stays narrowed (see
  // EVALUATION-PROTOCOL.md §4: inconsistent/future-dated timestamps are
  // detected; historical execution time cannot be proven against coordinated
  // backdating without an external attestation).
  const CHRONO_TOL_MS = 60 * 60 * 1000;
  const newestMtimeMs = (dir) => {
    let newest = 0;
    const walk = (d) => {
      for (const ent of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, ent.name);
        if (ent.isSymbolicLink()) continue;
        if (ent.isDirectory()) walk(p);
        else newest = Math.max(newest, statSync(p).mtimeMs);
      }
    };
    try {
      walk(dir);
    } catch {
      return 0;
    }
    return newest;
  };
  const runsDir = join(evalDir, "runs");
  const runIds = readdirSync(runsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  if (!runIds.length) problems.push("runs/ contains no run directories");
  const manifestDates = [];
  let resultCount = 0;
  for (const runId of runIds) {
    const runDir = join(runsDir, runId);
    const runJsonPath = join(runDir, "run.json");
    let run = null;
    if (!existsSync(runJsonPath)) {
      problem(`${runId}: missing run.json`, { archival: true });
    } else {
      try {
        run = JSON.parse(readFileSync(runJsonPath, "utf8"));
      } catch (e) {
        problems.push(`${runId}/run.json: invalid JSON (${e.message})`);
      }
      if (run) {
        if (![RUN_SCHEMA_V1, RUN_SCHEMA].includes(run.schema)) {
          problems.push(`${runId}/run.json: unexpected schema ${JSON.stringify(run.schema)}`);
        }
        if (run.runId !== runId) {
          problem(`${runId}/run.json: runId ${JSON.stringify(run.runId)} does not match directory`, {
            archival: true,
          });
        }
        if (hasLocalPath(JSON.stringify(run))) {
          problem(`${runId}/run.json: machine-local absolute path`, { archival: true });
        }
        if (run.schema === RUN_SCHEMA) {
          // Mandatory manifest fields + runId/createdAt stamp binding +
          // live-clock future check (2026-09-10 re-audit P2 closure).
          const v = validateRunV2(run);
          if (!v.ok) for (const err of v.errors) problems.push(`${runId}/run.json: ${err}`);
          const createdMs = parseIsoMs(run.createdAt);
          if (createdMs !== null) {
            manifestDates.push({
              runId,
              date: new Date(createdMs).toISOString().slice(0, 10),
            });
          }
        }
        // Execution-time attestation (2026-09-10 re-audit P2, --attest): a
        // manifest that records an attestation must carry the complete block,
        // captured at manifest-creation time and consistent with the
        // manifest's own createdAt within the chronology tolerance. The block
        // is self-recorded (not a cryptographic attestation) — the protocol's
        // guarantee stays narrowed accordingly.
        if (run.attestation !== undefined) {
          const a = run.attestation;
          if (!a || typeof a !== "object" || Array.isArray(a)) {
            problems.push(`${runId}/run.json: attestation must be an object`);
          } else {
            if (!isNonEmptyStr(a.source)) {
              problems.push(`${runId}/run.json: attestation.source must be a non-empty string`);
            }
            if (!isNonEmptyStr(a.attestation)) {
              problems.push(`${runId}/run.json: attestation.attestation must be a non-empty string`);
            }
            const capMs = parseIsoMs(a.capturedAt);
            const createdMs = parseIsoMs(run.createdAt);
            if (capMs === null) {
              problems.push(`${runId}/run.json: attestation.capturedAt must be an ISO timestamp`);
            } else if (createdMs !== null && Math.abs(capMs - createdMs) > RUNID_TOL_MS) {
              problems.push(`${runId}/run.json: attestation.capturedAt ${a.capturedAt} is more than 10 min from the manifest createdAt (attestations are captured at execution time)`);
            }
            if (a.source === "github-actions" && !isNonEmptyStr(a.githubRunId)) {
              problems.push(`${runId}/run.json: attestation.source "github-actions" requires attestation.githubRunId`);
            }
          }
        }
      }
    }
    // Exact candidate binding — manifest vs git (2026-09-10 re-audit P2):
    // re-resolve the manifest's refName in git and compare the peeled commit
    // with the recorded tagSha. Only immutable refs (tag names, 40-hex shas)
    // are strictly comparable; anything mutable/anonymous (HEAD, branches) or
    // unresolvable yields a WARNING so the binding gap is never a silent pass.
    if (run && typeof run.refName === "string" && run.refName
      && typeof run.tagSha === "string" && /^[0-9a-f]{40}$/.test(run.tagSha)) {
      if (/^[0-9a-f]{40}$/.test(run.refName)) {
        if (run.refName !== run.tagSha) {
          problems.push(
            `${runId}/run.json: refName is a commit sha but differs from tagSha (exact candidate binding)`,
          );
        } else if (!resolveGitCommit(run.refName)) {
          warnings.push(
            `warning: ${runId}/run.json: refName commit ${run.refName.slice(0, 12)} is not present in ${repoDir} — candidate binding not re-verified against git`,
          );
        }
      } else if (isTagRef(run.refName)) {
        const resolved = resolveGitCommit(run.refName);
        if (!resolved) {
          warnings.push(
            `warning: ${runId}/run.json: refName ${run.refName} could not be resolved in ${repoDir} — candidate binding not re-verified against git`,
          );
        } else if (resolved !== run.tagSha) {
          problems.push(
            `${runId}/run.json: refName ${run.refName} resolves to ${resolved.slice(0, 12)} but tagSha records ${run.tagSha.slice(0, 12)} (exact candidate binding mismatch)`,
          );
        }
      } else {
        warnings.push(
          `warning: ${runId}/run.json: refName ${JSON.stringify(run.refName)} is a mutable/anonymous ref (not a tag or 40-hex commit sha) — candidate binding not re-verifiable against git`,
        );
      }
    }
    // Chronology: the run manifest must not claim a time more than 1h after
    // the newest actual file write inside the run dir, and every record's
    // recordedAt must sit within [createdAt - 1h, createdAt + 1h] and not more
    // than 1h after the newest file mtime. Catches hand-authored dates (the
    // harness emits all timestamps from the live clock at run time).
    const newestM = newestMtimeMs(runDir);
    const createdAtMs = run ? parseIsoMs(run.createdAt) : null;
    if (run && createdAtMs === null) {
      problems.push(`${runId}/run.json: createdAt is missing or not an ISO timestamp`);
    }
    if (createdAtMs !== null && newestM > 0 && createdAtMs > newestM + CHRONO_TOL_MS) {
      problems.push(
        `${runId}/run.json: createdAt ${run.createdAt} is more than 1h after the newest file mtime in the run dir (hand-authored date)`,
      );
    }
    const recordAtChecks = (rel, r) => {
      const recAtMs = parseIsoMs(r.recordedAt);
      if (recAtMs === null) {
        problems.push(`${rel}: recordedAt is missing or not an ISO timestamp`);
        return;
      }
      if (newestM > 0 && recAtMs > newestM + CHRONO_TOL_MS) {
        problems.push(`${rel}: recordedAt ${r.recordedAt} is more than 1h after the newest file mtime in the run dir (future-dated)`);
      }
      if (createdAtMs !== null) {
        if (recAtMs > createdAtMs + CHRONO_TOL_MS) {
          problems.push(`${rel}: recordedAt ${r.recordedAt} is more than 1h after the run manifest createdAt (future-dated relative to the manifest)`);
        }
        if (recAtMs < createdAtMs - CHRONO_TOL_MS) {
          problems.push(`${rel}: recordedAt ${r.recordedAt} predates the run manifest createdAt ${run.createdAt}`);
        }
      }
    };
    for (const f of ["summary.md", "summary.json"]) {
      if (!existsSync(join(runDir, f))) problem(`${runId}: missing ${f}`, { archival: true });
    }
    const taskDirs = readdirSync(runDir, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "harnie-home");
    for (const taskEnt of taskDirs) {
      const condDirs = readdirSync(join(runDir, taskEnt.name), { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "clone");
      for (const condEnt of condDirs) {
        const resultDir = join(runDir, taskEnt.name, condEnt.name);
        const resultPath = join(resultDir, "result.json");
        if (!existsSync(resultPath)) {
          problems.push(`${runId}/${taskEnt.name}/${condEnt.name}: no result.json`);
          continue;
        }
        let r = null;
        try {
          r = JSON.parse(readFileSync(resultPath, "utf8"));
        } catch (e) {
          problems.push(`${runId}/${taskEnt.name}/${condEnt.name}/result.json: invalid JSON (${e.message})`);
          continue;
        }
        resultCount++;
        const v = validateResult(r);
        if (!v.ok) for (const err of v.errors) problems.push(`${runId}/${taskEnt.name}/${condEnt.name}/result.json: ${err}`);
        recordAtChecks(`${runId}/${taskEnt.name}/${condEnt.name}/result.json`, r);
        const rel = `${runId}/${taskEnt.name}/${condEnt.name}/result.json`;
        if (r.runId !== runId) problem(`${rel}: runId does not match run dir`, { archival: true });
        if (r.taskId !== taskEnt.name) problems.push(`${rel}: taskId does not match directory`);
        if (r.condition !== condEnt.name) problems.push(`${rel}: condition does not match directory`);
        // Exact candidate binding — record vs run manifest (2026-09-10
        // re-audit P2): a record's tagSha, refName and environment.ref must
        // EQUAL the run manifest's values; a mismatch means the record does
        // not describe the candidate it claims to sit under.
        if (run && typeof run.tagSha === "string" && run.tagSha
          && typeof r.tagSha === "string" && r.tagSha && r.tagSha !== run.tagSha) {
          problems.push(`${rel}: tagSha ${r.tagSha.slice(0, 12)} does not match the run manifest tagSha ${run.tagSha.slice(0, 12)} (exact candidate binding)`);
        }
        if (run && typeof run.refName === "string" && run.refName
          && typeof r.refName === "string" && r.refName && r.refName !== run.refName) {
          problems.push(`${rel}: refName ${JSON.stringify(r.refName)} does not match the run manifest refName ${JSON.stringify(run.refName)} (exact candidate binding)`);
        }
        if (run && typeof run.ref === "string" && run.ref) {
          const envRef = r.environment?.ref;
          if (r.schema === RESULT_SCHEMA) {
            // v2 records: environment.ref is REQUIRED, non-null, 40-hex, and
            // must equal the manifest's resolved ref (2026-09-10 re-audit P2
            // closure — `environment.ref: null` used to pass).
            if (typeof envRef !== "string" || !/^[0-9a-f]{40}$/.test(envRef)) {
              problems.push(`${rel}: environment.ref must be a 40-hex commit sha (required and non-null in v2 records)`);
            } else if (envRef !== run.ref) {
              problems.push(`${rel}: environment.ref ${envRef.slice(0, 12)} does not match the run manifest ref ${run.ref.slice(0, 12)} (exact candidate binding)`);
            }
          } else if (typeof envRef === "string" && envRef && envRef !== run.ref) {
            // v1 archival: soft check (both present).
            problems.push(`${rel}: environment.ref ${envRef.slice(0, 12)} does not match the run manifest ref ${run.ref.slice(0, 12)} (exact candidate binding)`);
          }
        }
        // Handoff-generation provenance (2026-09-10 re-audit P2 closure): the
        // pair must be complete (schema-level pairing above), the generating
        // ref must RESOLVE in git to the recorded generating sha, and a
        // release-qualifying record (status "ran" + condition "handoff") must
        // pin the generating sha to the evaluated tagSha. Older artifacts are
        // allowed only for non-qualifying records; an unresolvable generating
        // ref is an ERROR for qualifying records and a WARNING otherwise
        // (never a silent pass).
        {
          const genRefSet = r.handoffGeneratedByRef !== undefined && r.handoffGeneratedByRef !== null;
          const genShaSet = r.handoffGeneratedBySha !== undefined && r.handoffGeneratedBySha !== null;
          const qualifying = r.schema === RESULT_SCHEMA && r.status === "ran" && r.condition === "handoff";
          if (genRefSet && genShaSet) {
            const genRef = r.handoffGeneratedByRef;
            const genSha = r.handoffGeneratedBySha;
            if (qualifying && genSha !== r.tagSha) {
              problems.push(`${rel}: handoffGeneratedBySha ${String(genSha).slice(0, 12)} does not equal the evaluated tagSha ${(r.tagSha ?? "").slice(0, 12)} — a release-qualifying run (status "ran", condition "handoff") must consume an artifact generated by the same candidate; older artifacts are allowed only for non-qualifying records`);
            }
            if (isHex40Or64(genSha) && isNonEmptyStr(genRef)) {
              if (genSha.length === 64) {
                warnings.push(
                  `warning: ${rel}: handoffGeneratedBySha is the 64-hex sha256 form — handoffGeneratedByRef ${JSON.stringify(genRef)} cannot be re-resolved against git for it`,
                );
              } else {
                const resolvedGen = resolveGitCommit(genRef);
                if (!resolvedGen) {
                  if (qualifying) {
                    problems.push(`${rel}: handoffGeneratedByRef ${JSON.stringify(genRef)} could not be resolved in ${repoDir} (generating-ref resolution required for a release-qualifying record)`);
                  } else {
                    warnings.push(
                      `warning: ${rel}: handoffGeneratedByRef ${JSON.stringify(genRef)} could not be resolved in ${repoDir} — generating-ref binding not re-verified against git`,
                    );
                  }
                } else if (resolvedGen !== genSha) {
                  problems.push(`${rel}: handoffGeneratedByRef ${JSON.stringify(genRef)} resolves to ${resolvedGen.slice(0, 12)} but handoffGeneratedBySha records ${genSha.slice(0, 12)} (generating-ref binding mismatch)`);
                }
              }
            }
          } else if (qualifying) {
            problems.push(`${rel}: handoffGeneratedByRef/handoffGeneratedBySha missing — a release-qualifying run (status "ran", condition "handoff") requires handoffGeneratedBySha === tagSha; older artifacts are allowed only for non-qualifying records`);
          }
        }
        // Machine-path check is field-targeted: prompt text / notes may quote
        // the driver workspace or machine paths as CONTENT (e.g. a handoff
        // artifact rendered from a real driver session); those are raw
        // evidence. Record-owned path fields must be portable.
        for (const [k, v] of Object.entries(r.environment ?? {})) {
          if (hasLocalPath(v) || (typeof v === "string" && v.startsWith("/") && k !== "agentVersion")) {
            problem(`${runId}/${taskEnt.name}/${condEnt.name}/result.json: environment.${k} is a machine-local path`, { archival: true });
          }
        }
        for (const el of r.execution?.invocation ?? []) {
          // Only argv-position path elements (starting with "/") are checked;
          // a prompt-text element may legitimately quote machine paths as
          // content (e.g. handoff artifact text).
          if (typeof el === "string" && el.startsWith("/")) {
            problem(`${runId}/${taskEnt.name}/${condEnt.name}/result.json: execution.invocation contains an absolute-path element`, { archival: true });
            break;
          }
        }
        const refs = [
          ["execution.stdoutLog", r.execution?.stdoutLog],
          ["execution.stderrLog", r.execution?.stderrLog],
          ["edits.diffPath", r.edits?.diffPath],
          ["handoff.path", r.handoff?.path],
          ["patch.path", r.patch?.path],
        ];
        for (const [name, value] of refs) {
          if (!value || typeof value !== "string") continue;
          if (value.startsWith("disposable:")) continue; // intentionally tmp-only evidence
          if (value.startsWith("/")) {
            problem(`${runId}/${taskEnt.name}/${condEnt.name}/result.json: ${name} is an absolute path (${JSON.stringify(value)})`, { archival: true });
            continue;
          }
          if (!existsSync(resolve(resultDir, value))) {
            problems.push(`${runId}/${taskEnt.name}/${condEnt.name}/result.json: ${name} does not resolve (${value})`);
          }
        }
        const handoffFile = r.handoff?.path && !r.handoff.path.startsWith("disposable:")
          ? resolve(resultDir, r.handoff.path)
          : null;
        if (handoffFile && r.handoff.sha256) {
          if (!existsSync(handoffFile)) {
            problems.push(`${runId}/${taskEnt.name}/${condEnt.name}/result.json: handoff artifact missing, cannot verify sha256`);
          } else {
            const actual = sha256File(handoffFile);
            if (actual !== r.handoff.sha256) {
              problems.push(`${runId}/${taskEnt.name}/${condEnt.name}/result.json: handoff.sha256 mismatch (recorded ${r.handoff.sha256.slice(0, 12)}, actual ${actual.slice(0, 12)})`);
            }
          }
        }
        if (r.handoff?.sha256 && r.handoffArtifactSha && r.handoff.sha256 !== r.handoffArtifactSha) {
          problems.push(`${runId}/${taskEnt.name}/${condEnt.name}/result.json: handoffArtifactSha != handoff.sha256`);
        }
      }
    }
    // Summary drift (2026-09-10 re-audit P2): regenerate the run's canonical
    // summary via the harness's single summary-generation code path and compare
    // with the committed summary.json (structural equality, key-order
    // insensitive) AND the committed summary.md (byte equality). Drift in
    // either output means the committed summary no longer describes the
    // committed records — a hand-edited summary.md that still matches
    // summary.json (e.g. an appended "FULL MATRIX PASS" line) is caught by the
    // byte comparison (2026-09-10 re-audit P2 closure). --fix rewrites BOTH
    // outputs from the canonical regeneration.
    const summaryJsonPath = join(runDir, "summary.json");
    const summaryMdPath = join(runDir, "summary.md");
    if (run && existsSync(summaryJsonPath)) {
      let regenerated = null;
      try {
        regenerated = generateSummary(runDir, run);
      } catch {
        // An unreadable/invalid record was already reported above; drift cannot
        // be computed without every record.
      }
      if (regenerated) {
        let committed = null;
        try {
          committed = JSON.parse(readFileSync(summaryJsonPath, "utf8"));
        } catch (e) {
          problems.push(`${runId}/summary.json: invalid JSON (${e.message})`);
        }
        let jsonDrift = false;
        let mdDrift = false;
        if (committed) {
          jsonDrift = stableStringify(committed) !== stableStringify(regenerated.data);
        }
        if (existsSync(summaryMdPath)) {
          try {
            mdDrift = !readFileSync(summaryMdPath).equals(Buffer.from(regenerated.md, "utf8"));
          } catch (e) {
            problems.push(`${runId}/summary.md: unreadable (${e.message})`);
          }
        }
        if (jsonDrift || mdDrift) {
          const which = [jsonDrift && "summary.json", mdDrift && "summary.md"].filter(Boolean).join(" + ");
          if (fixMode) {
            writeFileSync(summaryJsonPath, JSON.stringify(regenerated.data, null, 2) + "\n");
            writeFileSync(summaryMdPath, regenerated.md);
            warnings.push(
              `warning: ${runId}: summary drift FIXED — ${which} regenerated from the committed records (--fix)`,
            );
          } else {
            problems.push(
              `${runId}: summary drift in ${which} — committed summary differs from the harness-regenerated canonical summary (rerun with --fix to regenerate)`,
            );
          }
        }
      }
    }
  }
  for (const f of ["README.md", "summary.md"]) {
    if (!existsSync(join(evalDir, f))) problems.push(`missing ${f} at eval dir root`);
  }
  // README/manifest date agreement (2026-09-10 re-audit P2, now enforced here
  // so verify-evidence alone carries what tests/eval-docs-consistency.test.ts
  // checks): every run manifest's createdAt UTC date must be claimed somewhere
  // in the eval dir's README.md — a manifest describing a day the README does
  // not claim is a documentation/manifest disagreement.
  const readmePath = join(evalDir, "README.md");
  if (existsSync(readmePath) && manifestDates.length) {
    const claimed = new Set(readFileSync(readmePath, "utf8").match(/20\d{2}-\d{2}-\d{2}/g) ?? []);
    for (const { runId, date } of manifestDates) {
      if (!claimed.has(date)) {
        problems.push(`${runId}/run.json: createdAt date ${date} is not claimed anywhere in README.md (README/manifest date agreement)`);
      }
    }
  }
  for (const w of warnings) console.error(w);
  if (problems.length) {
    console.error(`verify-evidence: FAILED — ${problems.length} problem(s) in ${evalDir}`);
    for (const p of problems) console.error(`  - ${p}`);
    if (warnings.length) console.error(`(${warnings.length} warning(s) also emitted above)`);
    return 1;
  }
  console.log(
    `verify-evidence: OK — ${runIds.length} run dir(s), ${resultCount} result record(s) checked in ${evalDir}` +
      (warnings.length ? ` (${warnings.length} warning(s))` : ""),
  );
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
  run --task <id> [--condition handoff|baseline|handoff,baseline] [--agent opencode|codex|pi|grok]
      [--handoff <path>] [--model <provider/model>] [--agent-arg <arg>]...
      [--ref HEAD|worktree|<sha>] [--run <id>] [--timeout <ms>]
      [--source-harness pi|opencode|codex] [--target-harness <name>]
      [--patch <diff>] [--agent-command "<argv...>"] [--study productivity-v1]
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
  qualify-productivity --dir <eval evidence root>
      Aggregate paired trials enrolled at run creation with
      --study productivity-v1. Reports the predeclared sample-coverage and
      developer-re-explanation thresholds as ESTABLISHED or NOT_ESTABLISHED;
      wall-time differences are exploratory and never substitute for the
      primary human-judged endpoint.
   verify-evidence --dir <curated eval dir> [--repo <git dir>] [--fix] [--archival]
       Integrity check over a curated eval directory (e.g.
       docs/research/eval-2026-09-09): every referenced file exists relative to
       its result.json; handoff artifact sha256s match; every result belongs to
       its run dir and matches its path; every run dir has run.json +
       summary.{md,json}; no machine-local absolute paths (/Users/,
       /var/folders/) in the records (raw receiver logs are never rewritten);
       references prefixed with disposable: are tmp-only and skipped for
       existence; chronology is enforced — recordedAt must sit within 1h of the
       run manifest createdAt and no more than 1h after the newest file mtime
       in the run dir (the harness emits all timestamps from the live clock);
       the v2 run manifest itself must be complete (validateRunV2: non-empty
       repo, ref, refName, tagSha 40-hex, createdAt, node, platform, tasks) and
       its runId must encode the execution timestamp (UTC, eval-<YYYYMMDD>T<HHMM>[SS])
       agreeing with createdAt within +/-10 min in BOTH directions, while
       createdAt must not be future-dated vs the verifier clock; each eval
       README.md must claim every manifest's createdAt date. Exact candidate
       binding (2026-09-10 re-audit): each record's tagSha, refName and
       environment.ref (required, 40-hex in v2) must EQUAL the run manifest's
       values; a run manifest whose refName is a tag or 40-hex commit sha is
       re-resolved via git rev-parse "<refName>^{commit}" in the repo (default:
       the repo this script lives in; override with --repo) and must match
       tagSha — unresolvable or mutable refs produce a WARNING, not a silent
       pass. Handoff-generated provenance (handoffGeneratedByRef/Sha) must be
       PAIRED and the ref must resolve in git to the recorded sha; a
       release-qualifying run (status "ran" + condition "handoff") requires
       handoffGeneratedBySha === tagSha (older artifacts are allowed only for
       non-qualifying records; unresolvable generating refs error there and
       warn otherwise). Summary drift: the committed summary.json of every run
       dir is compared against a harness regeneration of the same run dir and
       must match structurally, and the committed summary.md must match the
       regenerated Markdown BYTE FOR BYTE — pass --fix to rewrite BOTH outputs
       from the committed records. run --attest <string> records an
       execution-time attestation (GitHub Actions env when present) into the
       manifest, which verify-evidence then requires to be present and
       well-formed for that manifest. --archival (explicit opt-in) downgrades
       the post-v1-era conventions (run manifests, per-run summaries,
       machine-path convention, runId/createdAt binding) to loud warnings for
       the archived 2026-09-07/09-08 dirs; default mode stays strict.
       Warnings are printed to stderr and never fail the check by themselves.
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
    case "qualify-productivity":
      return cmdQualifyProductivity(parsed);
    case "verify-evidence":
      return cmdVerifyEvidence(parsed);
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
