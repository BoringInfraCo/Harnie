# Sprint 009 Outcome — Observed Tool Operations on Handoff

Status: **GO**  
Evidence cutoff: 2026-09-02

## Sprint question

> Can the OpenCode handoff name files already touched and whether edits reported success, using only structured source evidence?

Answer: yes. Operations come from `tool_call` arguments and matching `tool_result` (`isError`, short note). Event kinds stay `tool_call` / `tool_result`.

## What shipped

- `ToolOperation` on Work (`path`, `command`, `status`: pending / succeeded / failed)
- `extractToolOperations` (`rule: tool-call-arguments`, `observation: observed`)
- Pending next steps include the path when present (`Complete pending tool call read .git/config`)
- SQLite `operations` table; import still observe → derive → persist
- `harnie show` Operations section
- Handoff `filesTouched` + `operations`; OpenCode markdown sections **Files touched** and **Operations**
- Fixture C current state: edits reported success on `models.ts` and `types.ts`; verification not recorded

## Evidence

**Fixture C:** successful `edit` of `packages/ai/src/models.ts` and `packages/agent/src/types.ts`.

**Trace B:** `README.md`, `analysis.js`, `config.json` touched; pending `read` of `.git/config`.

Full file contents are not copied (notes truncated).

## Tests

93 passing across 22 files. New: `tests/operations.test.ts`, `tests/operations-persist.test.ts`, `tests/cli-operations.test.ts`, `tests/handoff-operations.test.ts`.

## Freeze

No live OpenCode run. No `file_read` / `file_write` event kinds.

## Decision

**GO.** Sprint 008’s file-path / completed-edit holes are closed in the package. Live continuation is still unrun.

## Sprint 010 recommendation

Re-score the OpenCode package (Fixture C / Trace B) against IMPLEMENTATION.md step 20. If the user authorizes it, run `opencode run` with the handoff and only “Continue the work.”
