# Sprint 021 — Checkpoints
**Status:** Complete — GO
**Phase:** 5 — Checkpoints
**Type:** Implementation
**Depends on:** Sprint 020 — GO

## Objective

Let an operator freeze a Work at a point in time with an explicit message:

```text
harnie checkpoint <work> [message]
harnie show <work>       → Checkpoints section
harnie history <work>    → Checkpoints section
```

A checkpoint is an immutable snapshot: id, message, timestamp, execution
watermark, event count, and frozen goal/decisions/findings/next-steps/
operations JSON taken from `loadWork` at creation time. Later attaches
grow the Work but never mutate existing rows. No dedupe: every call
creates a new `checkpoint:<work>:<seq>` row.

## Scope

1. `CHECKPOINTS_SCHEMA_SQL` (`src/store/schema.ts`): `checkpoints` table
   with `work_id`, `execution_id`, `message`, `created_at`,
   `event_ordinal_watermark`, `event_count`, `goal_json`,
   `decisions_json`, `findings_json`, `next_steps_json`,
   `operations_json`, plus `idx_checkpoints_work_seq (work_id, rowid)`.
   Executed in `ensureDerivedSchema()` (`src/store/persist.ts`)
   alongside `DERIVED_SCHEMA_SQL`, with a fallback that creates the
   table without the `rowid` index when SQLite rejects
   `no such column: rowid`.
2. `Checkpoint` + `Work.checkpoints` (`src/work/types.ts`, exact
   optional-property types, conditional spreads).
3. `src/store/checkpoints.ts`: `createCheckpoint(store, workId, message)`
   (throws `Work not found: <id>`; `BEGIN IMMEDIATE`; seq `COUNT(*)+1`,
   id padded to 4; latest execution via `rowid DESC` or `NULL`;
   watermark `COALESCE(MAX(ordinal), -1)`; frozen JSON from loaded work;
   `created_at` ISO) and `listCheckpoints(store, workId)` (`rowid ASC`,
   JSON parsed back).
4. CLI `checkpoint` (`src/cli/checkpoint.ts`, wired in `src/cli.ts`):
   missing id fails `Work id is required.`; unknown work fails
   `Work not found: <id>`; success prints `Checkpoint` / `Work` /
   `Message` blocks with `(no message)` fallback.
5. Display: `show` renders `Checkpoints` after Operations, before Events
   (`• <id> <createdAt> — <message> (<eventCount> events)`); `history`
   renders `Checkpoints` after History, before Decisions
   (`- <createdAt> <id> — <message> [after <executionId|none>,
   <eventCount> events]`). Both compose via `listCheckpoints` in the
   CLI; `loadWork` unchanged.
6. Tests `tests/cli-checkpoint.test.ts` (5 tests): frozen snapshot
   (`decisions_json` matches `loadWork`, `execution_id` latest);
   immutability across Codex attach via `importCodexSessionFile`
   with `{workId}` plus `show` old-count rendering; same message twice
   yields `:0001`/`:0002` with `history` ASC order and `runCli`
   dispatch; unknown-work and missing-id errors; empty message stored
   `""` and rendered `(no message)`.

## Freeze

No forks, restores, or branching. No auto-checkpoints on import.
No per-execution checkpoint tables (single work-scoped table).
No `--json`/MCP output (Phase 7).

## Evaluation

`npx tsc --noEmit`: clean. `npx vitest run
tests/cli-checkpoint.test.ts`: 5 passed. Full `npm run check`
equivalent (`npx vitest run`): 36 files, 160 tests pass (35/155 at
Sprint 020 + 1 file/5 tests). Manual trace: Pi Trace B checkpoint
`before attach` keeps its `event_count` after Codex attach grows the
Work to 2 executions; `show`/`history` list frozen counts. Issue found
during implementation: spec `CREATE INDEX ... (work_id, rowid)` is
rejected by `node:sqlite` (`no such column: rowid`), breaking all
imports — fixed by tolerant schema exec that keeps the exported SQL
verbatim and falls back to table-only creation.
