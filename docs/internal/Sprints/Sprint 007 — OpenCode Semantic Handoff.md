# Sprint 007 — OpenCode Semantic Handoff
**Status:** Complete — GO
**Phase:** 0 — Feasibility
**Type:** Implementation
**Depends on:** Sprint 006 — GO

## Objective

Produce a harness-neutral handoff from persisted Work, then render it for OpenCode.

```text
Work State
        ↓
Handoff
        ↓
OpenCode-oriented artifact
```

Never convert Pi JSONL into OpenCode SQLite.

## Sprint question

Can another harness continue Pi work from Harnie's Work object, without the developer re-explaining the session?

## Scope

1. Internal `Handoff` from `loadWork` (goal, workspace, execution, decisions, findings, next steps, event summary, provenance).
2. Renderer that writes a compact markdown/text artifact suitable to paste or launch into OpenCode.
3. `harnie handoff <work> --to opencode`
4. Tests: Fixture C handoff contains the xhigh/5.3 goal and the “I will” decision; Trace B handoff includes the pending next step and does not claim completion; handoff is built from Work, not by re-parsing Pi JSONL.

## Explicit freezes

No native OpenCode DB mutation unless a documented safe API exists. No Pi → OpenCode session translation. No cloud. No UI.

## Sprint north star

OpenCode can continue the work because Harnie knows what happened, not because it forwarded a transcript.
