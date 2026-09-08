# Sprint 025 — Checkpoint-Scoped Handoff
**Status:** Complete — GO
**Phase:** 5 — Checkpoints and Forks
**Type:** Implementation
**Depends on:** Sprint 024 — GO

## Objective

Let an operator produce a continuation package from an exact historical
checkpoint without creating a fork or leaking later attached executions:

```text
harnie handoff <work> --checkpoint <id> --to <target>

checkpoint watermark + frozen claims
        ↓
read-only Work projection
        ↓
existing handoff builder / renderer
```

Unflagged `handoff` remains the current/live Work view.

## Sprint question

After a Codex execution is attached to Pi Trace B, can a handoff pinned to
the pre-attach checkpoint stay byte-identical and exclude all Codex-only
context, while the ordinary handoff includes the new execution?

## Scope

1. `loadWorkAtCheckpoint` (`src/store/fork.ts`):
   - Reject an unknown Work with `Work not found: <id>`.
   - Resolve the checkpoint only within the requested Work; an unknown or
     foreign id fails with `Checkpoint not found: <id>`.
   - Select the exact fork prefix with
     `ordinal <= event_ordinal_watermark`.
   - Keep only executions referenced by selected events.
   - Clear work-level diagnostics like a fork does; diagnostics carried by
     retained events remain available to the handoff.
   - Overlay the checkpoint's frozen goal, decisions, findings, next steps,
     and operations. Do not run `deriveObservedWork` for the handoff view.
   - Preserve the parent Work id/workspace and use the checkpoint timestamp
     as the projected update time.
2. Reuse the Work-scoped checkpoint resolver in `createFork`, keeping its
   existing copy/re-derive behavior and error messages unchanged.
3. CLI `handoff`:
   - Accept `--checkpoint <id>` before or after the Work id.
   - Strictly parse the two value-taking flags (`--to`, `--checkpoint`),
     rejecting missing/empty/flag-shaped values, duplicates, unknown flags,
     and extra positional arguments with usage and exit 1.
   - Use the historical projection only when `--checkpoint` is present;
     otherwise load current Work exactly as before.
   - Feed the result through the existing target-neutral handoff builder and
     OpenCode/Pi/Codex renderers.
4. Keep existing unflagged handoff artifact filenames for compatibility.
   Checkpoint-scoped handoffs add a sanitized `.<checkpoint>` before the
   target suffix so historical output does not overwrite the canonical live
   handoff or another checkpoint export.
5. Update CLI help and README usage.
6. Tests (`tests/cli-handoff-checkpoint.test.ts`): stale checkpoint byte
   stability across attach; later execution/file exclusion versus live Work;
   latest checkpoint equality with live Work when no events follow it;
   direct event/execution prefix equality with an explicit fork; live and
   checkpoint artifact coexistence; no fork/checkpoint/store mutation;
   unknown and foreign checkpoint errors; malformed flag forms and no
   artifact on failure.

## Freeze

No schema changes. No auto-checkpoint or auto-fork. No `show --checkpoint` or
`history --checkpoint`. No restore/merge/export/MCP/native resume. No
renderer changes. No `derive.ts` changes and no new derive pass for
historical handoffs.

## Evaluation

`npm run build`: clean. Focused checkpoint/handoff/fork suite: 3 files,
22 tests pass. Full `npm run check`: 39 files, 191 tests pass. The pre-attach
Trace B handoff remains byte-identical after Codex attach and excludes Codex
source `01codexunfinished000000000001`, `src/cli.ts`, and `src/quiet.ts`;
the live handoff contains them. A checkpoint at the current watermark is
byte-identical to the live handoff. Store snapshots and row counts are
unchanged by checkpoint handoff projection. Live and checkpoint-qualified
artifacts coexist without overwriting one another, and the projected event /
execution prefix matches an explicit fork at the same checkpoint.

`vet` was invoked after each logical change but could not analyze because
the environment has no Anthropic credentials; after untracked files were
present, the installed CLI also crashed while constructing their diff. Its
external agentic fallback was not authorized. TypeScript, focused tests, the
full suite, and an independent subagent diff review provide the local
verification gate.

## North star

A receiver can continue from the exact historical state an operator chose,
without materializing a branch and without inheriting work that happened
after that checkpoint.
