# Sprint 014 — Pi Handoff Renderer
**Status:** Complete — GO
**Phase:** 2 — Bidirectional harness support
**Type:** Implementation

## Objective

Emit a Pi-oriented continuation package from Work State.

```text
Work
  → Handoff
  → renderPiHandoff
  → harnie handoff <work> --to pi
```

Never convert OpenCode SQLite into Pi JSONL.

## Scope

1. `renderPiHandoff` markdown (continue, do not re-investigate).
2. CLI `--to pi` writes stdout and `handoffs/<work>.pi.md`.
3. Tests: OpenCode-imported Work can hand off to Pi; Trace B stays unresolved.

## Freeze

No Pi session-file writes. No `pi` process launch. No OpenCode DB mutation.
