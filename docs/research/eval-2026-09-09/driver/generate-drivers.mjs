#!/usr/bin/env node
// Generator for the synthetic continuation driver used by the 2026-09-09
// directed-matrix evaluation (same opencode snapshot format as
// docs/research/eval-2026-09-08/driver/generate-drivers.mjs).
//
// The continuation driver completes STEPS 1-2 of the 3-step `greeting-command`
// benchmark task (create src/greeting.ts + tests/greeting.test.ts, vitest
// green) and hands step 3 (wire `greet <name>` into the CLI) to the receiver.
// The corresponding pre-state is applied to receiver clones by the harness
// `--patch` flag from driver-greeting-steps12.patch (generated from a scratch
// rc.2 clone; vitest 4/4 verified there).
//
//   node generate-drivers.mjs <output-dir>
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: generate-drivers.mjs <output-dir>");
  process.exit(1);
}

function opencodeSnapshot({ sessionId, title, directory, version, events }) {
  const messages = [];
  const parts = [];
  let mi = 0;
  let pi = 0;
  let t = Date.parse("2026-09-09T08:00:00Z");
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
      parts.push({ id: pid, message_id: msgId, time_created: t, data: { ...part } });
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

// exec1: driver completes steps 1-2 (greeting module + tests, vitest green).
const greetExec1 = opencodeSnapshot({
  sessionId: "ses_drvgreet0000000000000000001a",
  title: "greeting command — steps 1-2",
  directory: WS,
  version: "1.18.29",
  events: [
    { role: "user", parts: [
      { type: "text", text: "We are building a 3-step feature in this repo (/workspace/harnie-project). STEP 1: create src/greeting.ts exporting greet(name: string): string that returns `Hello, <name>!`, trims the name, and defaults to \"world\" when empty/missing. STEP 2: create tests/greeting.test.ts (vitest) covering basic/default/trim cases. Do steps 1 and 2 now, run the tests, and stop before any CLI wiring." },
    ] },
    { role: "assistant", parts: [
      { type: "step-start" },
      { type: "reasoning", text: "[SANITIZED REASONING]" },
      { type: "tool", tool: "write", callID: "call_drv_greet_e1_01", state: { status: "completed", input: { filePath: WS + "/src/greeting.ts" } } },
      { type: "tool", tool: "write", callID: "call_drv_greet_e1_02", state: { status: "completed", input: { filePath: WS + "/tests/greeting.test.ts" } } },
      { type: "tool", tool: "bash", callID: "call_drv_greet_e1_03", state: { status: "completed", input: { command: "npx vitest run tests/greeting.test.ts" } } },
      { type: "text", text: "vitest: 4 passed (4) — basic name, trim, empty default, whitespace default." },
      { type: "step-finish", reason: "stop" },
    ] },
    { role: "assistant", parts: [
      { type: "step-start" },
      { type: "text", text: "Steps 1 and 2 are complete and committed: src/greeting.ts exports greet(name) (returns `Hello, <name>!`; trims; defaults to \"world\" on empty/whitespace) and tests/greeting.test.ts covers 4 cases, vitest 4/4 green. Step 3 of the task remains: wire greet() into the CLI as a `greet <name>` subcommand that prints greet(name) and exits 0, plus a `greet <name>` line in the usage text, WITHOUT modifying src/greeting.ts or tests/greeting.test.ts. That step is left to the next session." },
      { type: "step-finish", reason: "stop" },
    ] },
  ],
});

// exec2: driver confirms the remaining next action (step 3) and stops.
const greetExec2 = opencodeSnapshot({
  sessionId: "ses_drvgreet0000000000000000002a",
  title: "greeting command — handoff point",
  directory: WS,
  version: "1.18.29",
  events: [
    { role: "user", parts: [
      { type: "text", text: "Continuing: re-verify the step 1-2 state and state exactly what the next session must do." },
    ] },
    { role: "assistant", parts: [
      { type: "step-start" },
      { type: "reasoning", text: "[SANITIZED REASONING]" },
      { type: "tool", tool: "read", callID: "call_drv_greet_e2_01", state: { status: "completed", input: { filePath: WS + "/src/greeting.ts" } } },
      { type: "tool", tool: "bash", callID: "call_drv_greet_e2_02", state: { status: "completed", input: { command: "npx vitest run tests/greeting.test.ts" } } },
      { type: "text", text: "Re-confirmed: vitest 4/4 green." },
      { type: "step-finish", reason: "tool-calls" },
    ] },
    { role: "assistant", parts: [
      { type: "step-start" },
      { type: "text", text: "Decision for the next session (step 3 only): add a `greet <name>` subcommand to src/cli.ts that prints greet(name) to stdout and exits 0, and add `greet <name>` to the usage/help text. Verify with `npm run build`, `node dist/cli.js greet Ada` (prints 'Hello, Ada!', exit 0), `node dist/cli.js greet '  Bob '` (prints 'Hello, Bob!'), `node dist/cli.js --help` listing 'greet <name>', and `npx vitest run tests/greeting.test.ts` still green. src/greeting.ts and tests/greeting.test.ts must remain untouched." },
      { type: "step-finish", reason: "stop" },
    ] },
  ],
});

writeFileSync(join(outDir, "driver-opencode_greeting_exec1.json"), JSON.stringify(greetExec1, null, 2) + "\n");
writeFileSync(join(outDir, "driver-opencode_greeting_exec2.json"), JSON.stringify(greetExec2, null, 2) + "\n");
console.log("Continuation drivers written to " + outDir);
