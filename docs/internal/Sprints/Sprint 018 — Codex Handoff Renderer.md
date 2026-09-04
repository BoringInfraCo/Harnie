# Sprint 018 — Codex Handoff Renderer
**Status:** Complete — GO
**Phase:** 2 — Bidirectional harness support
**Type:** Implementation
**Depends on:** Sprint 017 — GO

## Objective

Emit a Codex-oriented continuation package from Work State, closing the Phase 2 loop:

```text
Work
  → Handoff
  → renderCodexHandoff
  → harnie handoff <work> --to codex
```

Never convert Pi JSONL or OpenCode SQLite into Codex rollout JSONL.

## Scope

1. `renderCodexHandoff` markdown (continue, do not re-investigate, do not invent rollout records).
2. CLI `--to codex` writes stdout and `handoffs/<work>.codex.md`.
3. Tests: Codex-imported Work hands off to Codex without leaking reasoning; Trace B stays unresolved.

## Freeze

No Codex rollout-file writes. No `codex` process launch. No `~/.codex` mutation.

## Evaluation (Sprint 018)

Static rescore on `tests/fixtures/codex/unfinished-read.jsonl` — GO:

- Goal recovered: investigate `src/cli.ts`, add `--quiet` flag.
- Completed work named: `cat src/cli.ts` + `apply_patch src/cli.ts` succeeded.
- Files named: `src/cli.ts` touched, `src/quiet.ts` pending.
- Decision preserved: "I will update the quiet flag next."
- No reasoning leak (`secretly rewrite` absent), no rollout JSONL in output.
- Current state unresolved: pending `cat src/quiet.ts`. 38-line handoff.

Live gate attempted (`codex exec`, isolated `CODEX_HOME`, read-only sandbox):
auth withheld (401, no bearer in isolated env). Recorded only, not a product
hole per Sprint 011/016 convention. Prompt transmission confirmed (handoff echoed).
