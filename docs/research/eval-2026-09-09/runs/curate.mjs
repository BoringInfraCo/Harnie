#!/usr/bin/env node
// Curation for the 2026-09-09 directed-matrix evaluation. Fills ONLY the
// observed human/evaluator-judged fields into each raw result.json (produced
// by the harness `run` command) and registers it via the harness `record`
// command. Every value below was observed in the corresponding
// agent-stdout.log / agent-stderr.log / edits.diff / evaluator re-verification
// in the run's clone. Nothing is inferred or fabricated; unknowns stay unknown.
//
//   node curate.mjs <evalRoot>
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const evalRoot = process.argv[2];
const SCRIPT = join(import.meta.dirname, "..", "..", "..", "..", "scripts", "eval-continuation.mjs");

const R = (runId, task, condition) => join(evalRoot, runId, task, condition);

// verdict presets for honestly-recorded FAIL rows (provider/credit failures:
// the receiver produced no completion claim, so falseCompletion is false, and
// taskCompleted is false — the task demonstrably was not completed).
const providerFail = (stderrNote) => ({
  metrics: {
    developerReExplanation: "not-needed",
    repeatedInvestigation: "none",
    repeatedFinishedEdits: "none",
    nextActionCorrect: "unknown",
    missingOrFalseContext: "none",
    taskCompleted: false,
    falseCompletion: false,
  },
  verification: { ran: true, commands: [], passed: false, details: `receiver died before completing the task — ${stderrNote}` },
  status: "ran",
});

const keepSize = (r) => {
  r.metrics = {
    ...r.metrics,
    packageSizeChars: r.condition === "handoff" ? (r.handoff?.chars ?? null) : (r.metrics?.packageSizeChars ?? null),
  };
};

const edits = [];

// ---- Leg A: Pi -> Harnie -> OpenCode (version-flag) ----
edits.push({
  dir: R("eval-20260908T2106-legA", "version-flag", "handoff"),
  apply: (r) => {
    Object.assign(r, providerFail("openrouter/opencode-go provider error: 'message at position 5 with role assistant must not be empty' after 525.7s, no edits (agent-stderr.log)"));
    r.verification.details = "receiver died on an upstream provider error (empty assistant message) after reading src/cli.ts and package.json; made no edits; no completion claim";
    r.metrics.packageSizeChars = r.handoff?.chars ?? null;
    r.notes = "attempt 1 of the legA handoff condition; retried as eval-20260908T2116-legA-r2";
  },
});
edits.push({
  dir: R("eval-20260908T2116-legA-r2", "version-flag", "handoff"),
  apply: (r) => {
    r.metrics = {
      developerReExplanation: "not-needed", repeatedInvestigation: "none", repeatedFinishedEdits: "none",
      nextActionCorrect: "yes", missingOrFalseContext: "none", taskCompleted: true, falseCompletion: false,
    };
    keepSize(r);
    r.commandsRun = [
      { cmd: "npm run build", purpose: "receiver verification" },
      { cmd: "node dist/cli.js --version", purpose: "receiver verification" },
      { cmd: "npx vitest run tests/cli-init.test.ts", purpose: "receiver verification" },
    ];
    r.verification = {
      ran: true,
      commands: ["npm run build", "node dist/cli.js --version", "npx vitest run tests/cli-init.test.ts"],
      passed: true,
      details: "receiver reported pass; evaluator independently re-ran in the clone: build ok, `node dist/cli.js --version` prints 0.1.0-rc.2 exit 0, cli-init tests 7/7; diff = single --version branch reading package.json",
    };
    r.notes = "retry of the legA handoff condition after the provider error in eval-20260908T2106-legA";
  },
});
edits.push({
  dir: R("eval-20260908T2106-legA", "version-flag", "baseline"),
  apply: (r) => {
    r.metrics = {
      developerReExplanation: "not-needed", repeatedInvestigation: "none", repeatedFinishedEdits: "none",
      nextActionCorrect: "yes", missingOrFalseContext: "none", taskCompleted: true, falseCompletion: false,
    };
    keepSize(r);
    r.commandsRun = [
      { cmd: "npm run build", purpose: "receiver verification" },
      { cmd: "node dist/cli.js --version", purpose: "receiver verification" },
      { cmd: "npx vitest run tests/cli-init.test.ts", purpose: "receiver verification" },
    ];
    r.verification = {
      ran: true,
      commands: ["npm run build", "node dist/cli.js --version", "npx vitest run tests/cli-init.test.ts"],
      passed: true,
      details: "receiver reported pass (printed 0.1.0-rc.2, exit 0, cli-init 7/7 in-run); evaluator re-verified: build ok, --version 0.1.0-rc.2 exit 0, cli-init tests 7/7",
    };
  },
});

// ---- Leg B: OpenCode -> Harnie -> Pi (version-flag) ----
edits.push({
  dir: R("eval-20260908T2117-legB", "version-flag", "handoff"),
  apply: (r) => {
    r.metrics = {
      developerReExplanation: "not-needed", repeatedInvestigation: "none", repeatedFinishedEdits: "none",
      nextActionCorrect: "yes", missingOrFalseContext: "none", taskCompleted: true, falseCompletion: false,
    };
    keepSize(r);
    r.verification = {
      ran: true,
      commands: ["npm run build", "node dist/cli.js --version", "npx vitest run tests/cli-init.test.ts"],
      passed: true,
      details: "receiver's sandbox could not execute node/npm, so it explicitly reported verification BLOCKED rather than claiming success (no false completion); evaluator re-verified in the clone: build ok, `node dist/cli.js --version` prints 0.1.0-rc.2 exit 0, cli-init tests 7/7",
    };
    r.notes = "model openrouter/moonshotai/kimi-k2.5 (trial 1 of the kimi-k2.5 attempts; later attempts hit openrouter credit exhaustion)";
  },
});
for (const [runId, task, condition, note] of [
  ["eval-20260908T2117-legB", "version-flag", "baseline", "openrouter 402 in_flight_budget_exhausted (agent-stderr.log); partial edits before death: src/cli.ts + out-of-scope package-lock.json (recorded honestly)"],
  ["eval-20260908T2128-legB-r2", "version-flag", "handoff", "openrouter 402 in_flight_budget_exhausted (agent-stderr.log); partial edits: package-lock.json + src/cli.ts"],
  ["eval-20260908T2133-legB-r3", "version-flag", "baseline", "openrouter 402 in_flight_budget_exhausted (agent-stderr.log); no edits"],
  ["eval-20260908T2139-legC1", "shebang-guard", "handoff", "openrouter 402 openrouter_credits: balance could not fund the model's max_tokens request (agent-stderr.log); no edits"],
  ["eval-20260908T2139-legC1", "shebang-guard", "baseline", "openrouter 402 openrouter_credits: balance could not fund the model's max_tokens request (agent-stderr.log); no edits"],
  ["eval-20260908T2140-legB-m2", "version-flag", "handoff", "provider finish_reason: error after 150.0s (agent-stderr.log); no edits"],
  ["eval-20260908T2140-legB-m2", "version-flag", "baseline", "openrouter 429 free-models-per-day: daily free-tier limit (50) exhausted, resets 2026-09-09T20:00Z (agent-stderr.log); no edits"],
]) {
  edits.push({
    dir: R(runId, task, condition),
    apply: (r) => {
      Object.assign(r, providerFail("model/provider failure — " + note));
      r.notes = note;
      r.metrics.packageSizeChars = r.handoff?.chars ?? null;
    },
  });
}

// ---- Leg C2: Codex -> Harnie -> OpenCode (help-regression-test) ----
for (const cond of ["handoff", "baseline"]) {
  edits.push({
    dir: R("eval-20260908T2132-legC2", "help-regression-test", cond),
    apply: (r) => {
      r.metrics = {
        developerReExplanation: "not-needed", repeatedInvestigation: "none", repeatedFinishedEdits: "none",
        nextActionCorrect: "yes", missingOrFalseContext: "none", taskCompleted: true, falseCompletion: false,
      };
      keepSize(r);
      keepSize(r);
      r.commandsRun = [
        { cmd: "npx vitest run tests/regression-help.test.ts", purpose: "receiver verification" },
        { cmd: "npm run typecheck", purpose: "receiver verification" },
      ];
      r.verification = {
        ran: true,
        commands: ["npx vitest run tests/regression-help.test.ts", "npm run typecheck"],
        passed: true,
        details: "receiver reported pass (vitest 1/1, tsc clean in-run); evaluator re-verified in the clone: regression-help tests 1/1, typecheck clean, only tests/regression-help.test.ts created",
      };
    },
  });
}


// ---- Continuation leg: OpenCode -> Harnie -> Codex (greeting-command, 3-step) ----
for (const cond of ["handoff", "baseline"]) {
  edits.push({
    dir: R("eval-20260909T0006-cont", "greeting-command", cond),
    apply: (r) => {
      r.metrics = {
        developerReExplanation: "not-needed", repeatedInvestigation: "none", repeatedFinishedEdits: "none",
        nextActionCorrect: "yes", missingOrFalseContext: "none", taskCompleted: true, falseCompletion: false,
      };
      keepSize(r);
      r.commandsRun = [
        { cmd: "npm run build", purpose: "receiver verification (step 3)" },
        { cmd: "node dist/cli.js greet Ada", purpose: "receiver verification (step 3)" },
        { cmd: "node dist/cli.js greet '  Bob '", purpose: "receiver verification (step 3)" },
        { cmd: "node dist/cli.js --help", purpose: "receiver verification (step 3)" },
        { cmd: "npx vitest run tests/greeting.test.ts", purpose: "receiver verification (step 3)" },
      ];
      r.verification = {
        ran: true,
        commands: ["npm run build", "node dist/cli.js greet Ada", "node dist/cli.js greet '  Bob '", "node dist/cli.js --help", "npx vitest run tests/greeting.test.ts"],
        passed: true,
        details: "receiver completed STEP 3 ONLY: wired greet() into src/cli.ts as `greet <name>` + help line, left src/greeting.ts and tests/greeting.test.ts untouched (git diff empty on both, only src/cli.ts modified); evaluator re-verified in the clone: greet Ada / greet '  Bob ' correct (exit 0), help lists 'greet <name>', greeting vitest 4/4 green",
      };
      r.notes = "continuation-semantics run: driver pre-state (steps 1-2) committed in the clone via harness --patch; the handoff condition consumed the driver handoff, the baseline got the statement only";
    },
  });
}

for (const e of edits) {
  const path = join(e.dir, "result.json");
  let r;
  try {
    r = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    console.error(`SKIP (no result.json): ${e.dir}`);
    continue;
  }
  e.apply(r);
  writeFileSync(path, JSON.stringify(r, null, 2) + "\n");
  try {
    execFileSync(process.execPath, [SCRIPT, "record", "--dir", e.dir, "--file", path], { stdio: "inherit" });
  } catch {
    console.error(`RECORD FAILED: ${e.dir}`);
  }
}
console.log("curation done");
