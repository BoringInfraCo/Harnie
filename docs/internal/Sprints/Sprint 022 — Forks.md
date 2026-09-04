# Sprint 022 — Forks
**Status:** Complete — GO
**Phase:** 5 — Checkpoints
**Type:** Implementation
**Depends on:** Sprint 021 — GO

## Objective

Let an operator branch a Work at a checkpoint so the child can diverge
while the parent stays untouched:

```text
harnie fork <work> [--checkpoint <id>] [message]
harnie import codex <path> --work <child>
  → parent keeps 1 execution, child grows to 2
harnie show <child>     → Forked from section
harnie history <child>  → Forked from section
```

A fork is a NEW child Work row copying the parent's executions,
source sessions, and events as of a checkpoint watermark
(`ordinal <= event_ordinal_watermark`); only executions referenced by
copied events come along. Derived claims are recomputed with
child-scoped ids (`decision:<child>:<event>:<n>`), so the same session
file imports cleanly into parent AND child. New executions attach via
the existing `import --work <childId>` path (Sprint 019).

## Scope

1. Per-work identity re-scope (`src/store/schema.ts`): `executions`
   `PRIMARY KEY (work_id, id)`; `source_sessions` gains `work_id`
   `NOT NULL`, `PRIMARY KEY (work_id, execution_id)`,
   `UNIQUE (work_id, harness, source_id)`,
   `FOREIGN KEY (work_id, execution_id) REFERENCES executions(work_id, id)`;
   `events` `PRIMARY KEY (work_id, id)`,
   `UNIQUE (work_id, harness, source_session_id, source_event_id)`,
   `FOREIGN KEY (work_id, execution_id) REFERENCES executions(work_id, id)`.
   All existing columns kept. `checkpoints` columns unchanged, except
   `execution_id` drops its `REFERENCES executions(id)` clause (see
   Evaluation: the old single-column FK is a mismatch against the new
   composite PK and rejects every checkpoint insert).
2. Migration for pre-existing DBs in `ensureDerivedSchema()`
   (`src/store/persist.ts`): reads
   `SELECT sql FROM sqlite_master WHERE name IN
   ('executions','source_sessions','events')`; when a table lacks
   `PRIMARY KEY (work_id`, it is rebuilt with the new DDL and all rows
   preserved (executions/events: straight copy; source_sessions:
   `work_id` backfilled by joining executions on `execution_id`;
   checkpoints with the old `REFERENCES executions` FK rebuilt without
   it), inside a transaction with `PRAGMA foreign_keys = OFF/ON`.
   Fresh DBs take the new DDL directly. Works lineage columns
   (`forked_from_work_id` / `forked_from_checkpoint_id` / `fork_message`)
   added with the existing `isDuplicateColumnError` guard pattern.
3. Affected SQL: executions upsert `ON CONFLICT(work_id, id)`;
   source_sessions upsert `ON CONFLICT(work_id, execution_id)` with
   `work_id` in the INSERT; `loadWork` session lookup
   `WHERE work_id = ? AND execution_id = ?`;
   `listExecutions` (`src/store/query.ts`) joins source_sessions on
   both columns and scopes the per-execution event count by
   `events.work_id = executions.work_id`.
4. Lineage: `Work.forkedFrom` (`src/work/types.ts`, exact optional
   properties, conditional spreads); `loadWork` populates it from the
   new works columns, no extra queries.
5. `src/store/fork.ts`: `createFork(store, workId, message,
   checkpointId?)` throws `Work not found: <id>`, `Work has no events
   to fork.`, `Checkpoint not found: <id>` (explicit id must belong to
   the parent); else latest checkpoint, else auto-creates
   `createCheckpoint(store, workId, "pre-fork")`. Child id
   `work:fork:<8 base32 lowercase from crypto randomBytes>` looped
   until unused. One transaction inserts the works row (workspace copied,
   fresh ISO timestamps, diagnostics `'[]'`, lineage cols) plus the
   watermark-scoped executions/sessions/events copies; then
   `loadWork(child)` → `deriveObservedWork` → `persistObservedWork`
   recomputes derived claims with child-scoped ids. Returns child id +
   checkpoint id.
6. CLI `fork` (`src/cli/fork.ts`, wired in `src/cli.ts`): parses
   `--checkpoint <id>` anywhere; work id is the first non-flag arg,
   message the rest joined by `" "`. Missing id fails
   `Work id is required.`; errors go to stderr with exit 1; success
   prints `Fork` / `Forked from` blocks
   (`<parent> @ <checkpoint> — "<message| (no message)>"`).
7. Display: `show`/`history` render
   `Forked from\n<parent> @ <checkpoint> — "<message>"` right after the
   `Work` section when `work.forkedFrom` is present.
8. Tests `tests/cli-fork.test.ts` (6 tests): child-only Codex attach
   isolation with byte-identical parent handoff and `show`/`history`
   lineage rendering; pinning to an explicit pre-attach checkpoint
   (1-execution child) vs latest (2-execution child) vs auto `pre-fork`
   with `forked_from_checkpoint_id` row check; per-work idempotency
   (same Codex file into parent AND child, re-import 0); divergence
   (child decisions cite Codex events, parent handoff unchanged);
   errors (unknown work, foreign checkpoint, empty work, missing id);
   old-shape DB migration (hand-built previous DDL + 1 row reopened
   via `initHarnieStore`, `loadWork` intact, new PKs present).

## Freeze

No restores or merges back into the parent. No auto-forks on import.
No per-execution checkpoint tables (single work-scoped table).
No `--json`/MCP output (Phase 7).

## Evaluation

`npx tsc --noEmit`: clean. `npx vitest run tests/cli-fork.test.ts`:
6 passed. Full `npx vitest run`: 37 files, 166 tests pass (36/160 at
Sprint 021 + 1 file/6 tests). Manual trace: Pi Trace B forked,
Codex attached to the child only — parent keeps 1 execution and an
unchanged handoff, child has 2 with Codex-citing decisions; pinned
fork at the pre-attach checkpoint carries Pi events only. Issue found
during implementation: re-scoping `executions` to `PRIMARY KEY
(work_id, id)` turns the inherited
`checkpoints.execution_id REFERENCES executions(id)` into a foreign-key
mismatch, so every checkpoint insert fails on fresh DBs — fixed by
storing `execution_id` as plain `TEXT` (columns otherwise identical)
and rebuilding the table in old DBs that still carry the FK.
