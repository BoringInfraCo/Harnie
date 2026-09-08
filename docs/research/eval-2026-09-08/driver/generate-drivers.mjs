#!/usr/bin/env node
// Generator for the synthetic driver sessions used by the 2026-09-08 extended
// evaluation. Mirrors the rc.1 methodology (docs/research/eval-2026-09-07):
// each driver investigates its task, states an explicit "I will ..." decision,
// and ends BEFORE making the edit, so the handoff genuinely delegates the
// remaining work. Real prior sessions (codex rollout, pi JSONL) were imported
// directly and are NOT generated here.
//
//   node generate-drivers.mjs <output-dir> <scratch-repo-abs-path>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2];
const scratchRepo = process.argv[3];
if (!outDir || !scratchRepo) {
  console.error("usage: generate-drivers.mjs <output-dir> <scratch-repo-abs-path>");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

let ts = Date.parse("2026-09-08T09:00:00Z");
const tick = () => (ts += 8000);
const iso = () => new Date(ts).toISOString();

// ---------- pi-format driver: version-flag ----------
{
  const lines = [];
  const sessId = "8f1a2b3c-0000-4000-8000-000000000001";
  let n = 0;
  const id = () => (n++).toString(16).padStart(8, "0");
  const msg = (role, content, extra = {}) =>
    lines.push(
      JSON.stringify({
        type: "message",
        id: id(),
        parentId: null,
        timestamp: iso(),
        message: { role, content, timestamp: ts, ...extra },
      }),
    );
  lines.push(
    JSON.stringify({
      type: "session",
      version: 3,
      id: sessId,
      timestamp: iso(),
      cwd: "/workspace/harnie-project",
    }),
  );
  lines.push(
    JSON.stringify({ type: "model_change", id: id(), parentId: null, timestamp: iso(), provider: "openrouter", modelId: "moonshotai/kimi-k2.6" }),
  );
  lines.push(
    JSON.stringify({ type: "thinking_level_change", id: id(), parentId: null, timestamp: iso(), thinkingLevel: "medium" }),
  );
  msg("user", [
    { type: "text", text: "Add a --version flag to the Harnie CLI in this repo (/workspace/harnie-project). It should print the version from package.json and exit 0, before any other argument handling. Investigate first; do not edit yet." },
  ]);
  msg("assistant", [
    { type: "thinking", thinking: "[SANITIZED REASONING]" },
    { type: "toolCall", id: "call_drv_pi_01", name: "bash", arguments: { command: "node -p \"require('/workspace/harnie-project/package.json').version\"" } },
  ]);
  msg("toolResult", [{ type: "text", text: "0.0.0" }], { toolCallId: "call_drv_pi_01", toolName: "bash", isError: false });
  msg("assistant", [
    { type: "thinking", thinking: "[SANITIZED REASONING]" },
    { type: "toolCall", id: "call_drv_pi_02", name: "read", arguments: { path: "/workspace/harnie-project/src/cli.ts" } },
  ]);
  msg("toolResult", [{ type: "text", text: "     1 import { ... } ...\n    40 export function main(argv: string[]): number {\n    41   const [cmd, ...rest] = argv;\n    42   switch (cmd) {" }], { toolCallId: "call_drv_pi_02", toolName: "read", isError: false });
  msg("assistant", [
    { type: "text", text: "Findings: the version lives in package.json (0.0.0) and argument handling starts at the top of src/cli.ts main(). I will add a --version / -v branch as the FIRST check in main() that prints the version read from package.json and exits 0, leaving every other command unchanged. The edit itself is left to the next session — nothing has been modified yet." },
  ]);
  writeFileSync(join(outDir, "driver-pi_version-flag.jsonl"), lines.join("\n") + "\n");
}

// ---------- opencode-format drivers ----------
function opencodeSnapshot({ sessionId, title, directory, version, events }) {
  // events: flat list of {role, parts:[...]} ; converts to messages+parts
  const messages = [];
  const parts = [];
  let mi = 0;
  let pi = 0;
  let t = Date.parse("2026-09-08T09:00:00Z");
  for (const ev of events) {
    const msgId = `msg_drv_${sessionId.slice(-6)}_${String(mi++).padStart(3, "0")}`;
    t += 6000;
    messages.push({
      id: msgId,
      time_created: t,
      data: {
        role: ev.role,
        ...(ev.role === "assistant"
          ? { parentID: messages[messages.length - 1]?.id ?? null, path: { cwd: directory }, modelID: "kimi-k2.7-code", providerID: "opencode-go" }
          : {}),
        time: { created: t },
      },
    });
    for (const part of ev.parts) {
      t += 500;
      const pid = `prt_drv_${sessionId.slice(-6)}_${String(pi++).padStart(3, "0")}`;
      const data = { ...part };
      parts.push({ id: pid, message_id: msgId, time_created: t, data });
    }
  }
  return {
    harness: "opencode",
    format: "opencode-session-v1",
    session: {
      id: sessionId,
      directory,
      title,
      agent: "build",
      model: { id: "kimi-k2.7-code", providerID: "opencode-go" },
      version,
      time_created: messages[0].time_created,
      time_updated: messages[messages.length - 1].time_created,
    },
    messages,
    parts,
  };
}

const WS = "/workspace/harnie-project";
// version-flag (repeat trials)
{
  const snap = opencodeSnapshot({
    sessionId: "ses_drvvf0000000000000000000001a",
    title: "version-flag driver",
    directory: WS,
    version: "1.18.29",
    events: [
      { role: "user", parts: [{ type: "text", text: "Add a --version flag to the Harnie CLI that prints the package version and exits 0 before any other argument handling. Investigate first; do not edit yet." }] },
      { role: "assistant", parts: [
        { type: "step-start" },
        { type: "reasoning", text: "[SANITIZED REASONING]" },
        { type: "tool", tool: "bash", callID: "call_drv_oc_vf_01", state: { status: "completed", input: { command: "node -p \"require('" + WS + "/package.json').version\"" } } },
        { type: "text", text: "0.0.0" },
        { type: "step-finish", reason: "tool-calls" },
      ] },
      { role: "assistant", parts: [
        { type: "step-start" },
        { type: "tool", tool: "read", callID: "call_drv_oc_vf_02", state: { status: "completed", input: { filePath: WS + "/src/cli.ts" } } },
        { type: "text", text: "Argument handling starts at the top of main() in src/cli.ts." },
        { type: "step-finish", reason: "tool-calls" },
      ] },
      { role: "assistant", parts: [
        { type: "step-start" },
        { type: "text", text: "Plan: add a --version / -v branch as the first check in main() that prints the version read from package.json (0.0.0) and exits 0; all other commands unchanged. The edit itself is left to the next session — nothing modified yet." },
        { type: "step-finish", reason: "stop" },
      ] },
    ],
  });
  writeFileSync(join(outDir, "driver-opencode_version-flag.json"), JSON.stringify(snap, null, 2) + "\n");
}

// long work: 3 executions for help-regression-test
const helpExec1 = opencodeSnapshot({
  sessionId: "ses_drvlg0000000000000000000001a",
  title: "help regression — recon",
  directory: WS,
  version: "1.18.29",
  events: [
    { role: "user", parts: [
      { type: "text", text: "We need a regression test that pins the CLI help surface of this repo. Create tests/regression-help.test.ts asserting the help output includes 'backup <path>', 'restore <path> [--force]', 'handoff <work>', and 'import pi <path>'. Start by studying the existing test style." },
    ] },
    { role: "assistant", parts: [
      { type: "step-start" },
      { type: "reasoning", text: "[SANITIZED REASONING]" },
      { type: "tool", tool: "read", callID: "call_drv_lg_e1_01", state: { status: "completed", input: { filePath: WS + "/tests/cli-init.test.ts" } } },
      { type: "text", text: "cli-init.test.ts captures stdout via a capture() helper and calls runCli from ../src/cli.js." },
      { type: "tool", tool: "grep", callID: "call_drv_lg_e1_02", state: { status: "completed", input: { pattern: "capture", path: WS + "/tests" } } },
      { type: "text", text: "Only cli-init.test.ts uses that pattern; there is no existing help regression test." },
      { type: "step-finish", reason: "stop" },
    ] },
    { role: "assistant", parts: [
      { type: "step-start" },
      { type: "text", text: "Recon done: the capture() pattern in tests/cli-init.test.ts is the right template. Next session should enumerate the exact help strings." },
      { type: "step-finish", reason: "stop" },
    ] },
  ],
});

const helpExec2 = opencodeSnapshot({
  sessionId: "ses_drvlg0000000000000000000002a",
  title: "help regression — string enumeration",
  directory: WS,
  version: "1.18.29",
  events: [
    { role: "user", parts: [
      { type: "text", text: "Continuing: enumerate the exact help strings the regression test must pin." },
    ] },
    { role: "assistant", parts: [
      { type: "step-start" },
      { type: "reasoning", text: "[SANITIZED REASONING]" },
      { type: "tool", tool: "bash", callID: "call_drv_lg_e2_01", state: { status: "completed", input: { command: "node dist/cli.js --help" } } },
      { type: "text", text: "Help lists backup/restore/handoff/import/show/sessions etc." },
      { type: "tool", tool: "grep", callID: "call_drv_lg_e2_02", state: { status: "completed", input: { pattern: "backup <path>|restore <path>|handoff <work>|import pi <path>", path: WS + "/src" } } },
      { type: "text", text: "All four strings are produced by src/cli.ts usage text." },
      { type: "step-finish", reason: "stop" },
    ] },
    { role: "assistant", parts: [
      { type: "step-start" },
      { type: "text", text: "Confirmed the four strings exist verbatim in the help output: 'backup <path>', 'restore <path> [--force]', 'handoff <work>', 'import pi <path>'. Session interrupted before writing the test." },
      { type: "step-finish", reason: "stop" },
    ] },
  ],
});

const helpExec3 = opencodeSnapshot({
  sessionId: "ses_drvlg0000000000000000000003a",
  title: "help regression — plan",
  directory: WS,
  version: "1.18.29",
  events: [
    { role: "user", parts: [
      { type: "text", text: "One more pass: decide exactly what the new test file looks like, then stop. Do not write it." },
    ] },
    { role: "assistant", parts: [
      { type: "step-start" },
      { type: "reasoning", text: "[SANITIZED REASONING]" },
      { type: "tool", tool: "read", callID: "call_drv_lg_e3_01", state: { status: "completed", input: { filePath: WS + "/tests/cli-init.test.ts" } } },
      { type: "text", text: "Re-confirmed capture() helper shape and import style." },
      { type: "tool", tool: "ls", callID: "call_drv_lg_e3_02", state: { status: "completed", input: { path: WS + "/tests" } } },
      { type: "text", text: "tests/regression-help.test.ts does not exist yet." },
      { type: "step-finish", reason: "stop" },
    ] },
    { role: "assistant", parts: [
      { type: "step-start" },
      { type: "text", text: "Decision: I will create tests/regression-help.test.ts importing runCli from ../src/cli.js, use the capture() pattern from tests/cli-init.test.ts for a ['--help'] invocation, and assert the output includes 'backup <path>', 'restore <path> [--force]', 'handoff <work>', and 'import pi <path>'. No existing file will be modified. The write itself is left to the next session." },
      { type: "step-finish", reason: "stop" },
    ] },
  ],
});

writeFileSync(join(outDir, "driver-opencode_help-regression_exec1.json"), JSON.stringify(helpExec1, null, 2) + "\n");
writeFileSync(join(outDir, "driver-opencode_help-regression_exec2.json"), JSON.stringify(helpExec2, null, 2) + "\n");
writeFileSync(join(outDir, "driver-opencode_help-regression_exec3.json"), JSON.stringify(helpExec3, null, 2) + "\n");

// unrelated repo: slugify
{
  const snap = opencodeSnapshot({
    sessionId: "ses_drvsl0000000000000000000001a",
    title: "slugify driver",
    directory: scratchRepo,
    version: "1.18.29",
    events: [
      { role: "user", parts: [
        { type: "text", text: "In this repo (" + scratchRepo + ") add a slugify function in src/slugify.ts and a test for it in tests/slugify.test.ts. Investigate first; do not edit yet." },
      ] },
      { role: "assistant", parts: [
        { type: "step-start" },
        { type: "reasoning", text: "[SANITIZED REASONING]" },
        { type: "tool", tool: "read", callID: "call_drv_sl_01", state: { status: "completed", input: { filePath: scratchRepo + "/README.md" } } },
        { type: "text", text: "Tiny utility repo; no existing slugify; vitest-style test dir exists." },
        { type: "tool", tool: "ls", callID: "call_drv_sl_02", state: { status: "completed", input: { path: scratchRepo } } },
        { type: "text", text: "Top level: README.md, package.json, src/, tests/." },
        { type: "step-finish", reason: "stop" },
      ] },
      { role: "assistant", parts: [
        { type: "step-start" },
        { type: "text", text: "Plan: create src/slugify.ts exporting slugify(input: string): string that lowercases, trims, replaces runs of non-alphanumeric characters with single hyphens, and strips leading/trailing hyphens. Then create tests/slugify.test.ts with vitest covering empty string, spaces, punctuation, and mixed case. The edits themselves are left to the next session — nothing modified yet." },
        { type: "step-finish", reason: "stop" },
      ] },
    ],
  });
  writeFileSync(join(outDir, "driver-opencode_unrelated-slugify.json"), JSON.stringify(snap, null, 2) + "\n");
}

console.log("Drivers written to " + outDir);
