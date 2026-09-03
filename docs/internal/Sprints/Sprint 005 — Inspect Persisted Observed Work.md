# Sprint 005 — Inspect Persisted Observed Work
**Status:** Complete — GO
**Phase:** 0 — Feasibility
**Type:** Implementation
**Depends on:** Sprint 004 — GO

## Objective

Make durable observed Work visible from the CLI without inventing meaning.

```text
harnie init
harnie import pi <session.jsonl>
harnie list
harnie show <work>
```

## Sprint question

Can a developer inspect persisted observed Work well enough to see workspace, source identity, chronology, and unfinished tool activity?

## Scope

1. Thin `harnie import pi <path>` over `importPiSessionFile`.
2. `harnie list` — work id, workspace, last harness, updated time.
3. `harnie show <work>` — workspace, execution, event counts by kind, missing-tool-result diagnostics, no invented goal/decisions.
4. Tests against Trace A/B in a temp `HARNIE_HOME`.

## Explicit freezes

No semantic derivation, OpenCode handoff, native resume, cloud, UI, MCP.

## Sprint north star

See what happened before deciding what the work means.
