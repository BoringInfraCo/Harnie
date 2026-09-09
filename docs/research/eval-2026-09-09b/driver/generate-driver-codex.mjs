#!/usr/bin/env node
// Generator for the synthetic Codex driver used by the 2026-09-09b funded
// rerun pass. The driver performs the INVESTIGATION phase of the
// `first-run-recovery` benchmark task (reads docs/internal/FIRST-RUN.md and
// the backup/restore CLI help, formulates the Recovery-section plan) and
// explicitly leaves the edit to the next session. Synthetic, sanitized, and
// declared as such in the run README — same approach as the 2026-09-09
// synthetic drivers.
//
// Fixture-data rule: every timestamp below (2026-09-10T05:20:xxZ) is a
// fictional session stamp baked into the fixture bytes that were imported and
// sha-pinned. They are NOT execution times; the pass executed
// 2026-09-09T01:41Z–01:46Z (see this dir's README chronology note).
//
//   node generate-drivers.mjs <output-dir>
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: generate-drivers.mjs <output-dir>");
  process.exit(1);
}

const sessionId = "01a0drv-firstrun-4f2a-9c31-000000000001";
const cwd = "/workspace/harnie-project";
const ts = (t) => `2026-09-10T05:20:${String(t).padStart(2, "0")}.000Z`;

const records = [
  {
    type: "session_meta",
    timestamp: ts(0),
    payload: { id: sessionId, cwd, source: "cli", timestamp: ts(0) },
  },
  {
    type: "turn_context",
    timestamp: ts(1),
    payload: { model: "gpt-5.2-codex", cwd, approval_policy: "never", sandbox_mode: "workspace-write" },
  },
  {
    type: "response_item",
    timestamp: ts(2),
    payload: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_text",
          text: "We are documenting recovery in this repo (/workspace/harnie-project). Investigate what `harnie backup <path>` and `harnie restore <path> --force` actually do, then plan a short '## Recovery' section for docs/internal/FIRST-RUN.md covering backup (consistent SQLite snapshot, 0600), restore (validates the backup then overwrites the live store), and the no-undo caveat. Investigate first; do not edit yet.",
        },
      ],
    },
  },
  {
    type: "response_item",
    timestamp: ts(5),
    payload: {
      type: "function_call",
      name: "shell",
      call_id: "call_drv_frr_cx_01",
      arguments: JSON.stringify({ command: ["bash", "-lc", "sed -n 1,80p docs/internal/FIRST-RUN.md"] }),
    },
  },
  {
    type: "response_item",
    timestamp: ts(6),
    payload: {
      type: "function_call_output",
      call_id: "call_drv_frr_cx_01",
      output: "walkthrough of init/observe/handoff; no recovery guidance",
    },
  },
  {
    type: "response_item",
    timestamp: ts(8),
    payload: {
      type: "function_call",
      name: "shell",
      call_id: "call_drv_frr_cx_02",
      arguments: JSON.stringify({ command: ["bash", "-lc", "node dist/cli.js backup --help && node dist/cli.js restore --help"] }),
    },
  },
  {
    type: "response_item",
    timestamp: ts(9),
    payload: {
      type: "function_call_output",
      call_id: "call_drv_frr_cx_02",
      output: "backup <path>; restore <path> [--force]",
    },
  },
  {
    type: "response_item",
    timestamp: ts(12),
    payload: {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "Findings: docs/internal/FIRST-RUN.md currently walks through init/observe/handoff but has no recovery guidance. `harnie backup <path>` writes a consistent SQLite snapshot of the live store with mode 0600; `harnie restore <path> --force` validates the backup and then overwrites the live store; restore has NO undo, so a bad backup replaces the live state irreversibly. Plan for the next session: add a short '## Recovery' section to docs/internal/FIRST-RUN.md with those three facts and the exact commands. The edit itself is left to the next session — nothing modified yet.",
        },
      ],
    },
  },
];

writeFileSync(join(outDir, "driver-codex_first-run-recovery.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n");
console.log("Codex driver written to " + outDir);
