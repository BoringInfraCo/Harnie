# Sprint 020 — Work History Commands
**Status:** Complete — GO
**Phase:** 3 — Work History
**Type:** Implementation
**Depends on:** Sprint 019 — GO

## Objective

Make Harnie useful with no handoff: answer which agents worked on a Work,
what each did, and what changed between executions.

```text
harnie executions <work>
harnie history <work>
harnie diff <work> <execution-a> <execution-b>
```

## Scope

1. `src/work/diff.ts`: `executionEventCounts` (per-execution kind counts,
   throws `Execution not found: <id>`) and `diffExecutions` (kept/added/removed
   decisions, findings, next steps, operations; claims attributed to executions
   via evidence event ids; text-compared and deduped).
2. `listExecutions` (`src/store/query.ts`, from Sprint 019).
3. CLI `executions` / `history` / `diff` (`src/cli/*.ts`, wired in `src/cli.ts`),
   mirroring the `list`/`show` `CliIo` pattern. `diff` prints `+`/`=`/`-` claim
   lines and per-kind event-count deltas; empty sections omitted.
4. Tests: `tests/work-diff.test.ts` (synthetic works, partitioning, error
   cases, self-diff) and `tests/cli-work-history.test.ts` (Pi + attached Codex
   execution end-to-end, error cases).

## Freeze

No per-execution derived-claim tables (evidence-join attribution instead).
No checkpoints/forks (Phase 5). No `--json`/MCP (Phase 7).

## Evaluation

`npm run check`: 35 files, 155 tests pass. `diff pi → codex` on attached
Trace B fixture surfaces Codex's `src/cli.ts` operations as added; self-diff
yields kept-only. Unknown execution fails with `Execution not found`.
