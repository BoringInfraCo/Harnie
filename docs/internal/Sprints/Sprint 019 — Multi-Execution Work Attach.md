# Sprint 019 — Multi-Execution Work Attach
**Status:** Complete — GO
**Phase:** 3 — Work History (prerequisite)
**Type:** Implementation
**Depends on:** Sprint 018 — GO

## Objective

Let multiple harness sessions attach to one Work as separate executions:

```text
harnie import pi <path>
harnie import codex <other-path> --work <work>
  → Work with Execution 1 (pi) + Execution 2 (codex)
```

Identity stays explicit: no auto-grouping. One session is still one execution;
`--work` only says which Work it continues.

## Scope

1. `attachObservedWork` (`src/work/observe.ts`): merge incoming execution/events
   into existing Work, preserving id, workspace, createdAt; dedupe executions,
   events, and diagnostics by id so re-attach is a no-op.
2. Engine `ImportSessionOptions { workId }` (`src/engine/import.ts`): missing
   target fails with `Work not found: <id>`; merged work is re-derived whole
   (`deriveObservedWork` is execution-agnostic) then persisted.
3. `persistObservedWork` (`src/store/persist.ts`): loop over all executions
   (upsert execution + source_session each), per-event execution attribution
   (no more `executions[0]` stamping), dense ordinals from `MAX(ordinal)`.
4. `listWorks` (`src/store/query.ts`): one row per work (scalar subqueries for
   latest execution); new `listExecutions` for Sprint 020.
5. CLI `import --work <id>` (order-independent flag) in `src/cli/import.ts`.
6. Tests: `tests/cli-import-attach.test.ts` (9 tests: attach both flag orders,
   missing-work/empty-flag errors, no list fan-out, idempotent re-attach with
   no execution duplication, natural-import regression, handoff over attached
   work, `runCli` end-to-end).

## Freeze

No workspace-path auto-grouping. No per-execution derived-claim tables
(re-derive whole Work). No `history`/`executions`/`diff` commands (Sprint 020).

## Evaluation

`npm run check`: 33 files, 142 tests pass. Manual trace: Pi Trace B +
Codex fixture attach yields 2 executions, combined events, single `list` row,
second attach inserts 0 events. Bug found by tests during implementation:
duplicate merged events produced duplicate claim ids (`UNIQUE constraint
failed: next_steps.id`) — fixed by event dedupe in `attachObservedWork`.
