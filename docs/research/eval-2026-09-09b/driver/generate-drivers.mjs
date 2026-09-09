#!/usr/bin/env node
// Generator for the synthetic OpenCode driver used by the 2026-09-09b funded
// rerun pass (same opencode snapshot format as
// docs/research/eval-2026-09-09/driver/generate-drivers.mjs).
//
// Fixture-data rule: the 2026-09-10T05:00Z base timestamp below is a
// fictional session stamp baked into the fixture bytes that were imported.
// It is NOT an execution time; the pass executed 2026-09-09T01:41Z–01:46Z
// (see this dir's README chronology note).
//
// The driver session performs the investigation phase of the `first-run-
// recovery` benchmark task (reads docs/internal/FIRST-RUN.md and the
// backup/restore CLI surface, formulates the Recovery-section plan) and
// explicitly leaves the edit to the next session — the same driver shape the
// 2026-09-09 version-flag legs used. The handoff artifact rendered from this
// session conditions the `handoff` receiver; the baseline gets the statement
// only.
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
  let t = Date.parse("2026-09-10T05:00:00Z");
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

const firstRunExec = opencodeSnapshot({
  sessionId: "ses_drvfirstrun000000000000001a",
  title: "first-run recovery section — investigation",
  directory: WS,
  version: "1.18.29",
  events: [
    { role: "user", parts: [
      { type: "text", text: "We are documenting recovery in this repo (/workspace/harnie-project). Investigate what `harnie backup <path>` and `harnie restore <path> --force` actually do, then plan a short '## Recovery' section for docs/internal/FIRST-RUN.md covering backup (consistent SQLite snapshot, 0600), restore (validates the backup then overwrites the live store), and the no-undo caveat. Investigate first; do not edit yet." },
    ] },
    { role: "assistant", parts: [
      { type: "step-start" },
      { type: "reasoning", text: "[SANITIZED REASONING]" },
      { type: "tool", tool: "read", callID: "call_drv_frr_01", state: { status: "completed", input: { filePath: WS + "/docs/internal/FIRST-RUN.md" } } },
      { type: "tool", tool: "bash", callID: "call_drv_frr_02", state: { status: "completed", input: { command: "node dist/cli.js backup --help && node dist/cli.js restore --help" } } },
      { type: "step-finish", reason: "tool-calls" },
    ] },
    { role: "assistant", parts: [
      { type: "step-start" },
      { type: "text", text: "Findings: docs/internal/FIRST-RUN.md currently walks through init/observe/handoff but has no recovery guidance. `harnie backup <path>` writes a consistent SQLite snapshot of the live store with mode 0600; `harnie restore <path> --force` validates the backup and then overwrites the live store; restore has NO undo, so a bad backup replaces the live state irreversibly. Plan for the next session: add a short '## Recovery' section to docs/internal/FIRST-RUN.md with those three facts and the exact commands. The edit itself is left to the next session — nothing modified yet." },
      { type: "step-finish", reason: "stop" },
    ] },
  ],
});

writeFileSync(join(outDir, "driver-opencode_first-run-recovery.json"), JSON.stringify(firstRunExec, null, 2) + "\n");
console.log("Driver written to " + outDir);
