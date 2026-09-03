# Sprint 009 — Observed Tool Operations on Handoff
**Status:** Complete — GO
**Phase:** 0 — Feasibility
**Type:** Implementation
**Depends on:** Sprint 008 — Conditional GO

## Objective

Close the Sprint 008 package holes that force re-investigation, without turning tool names into semantic event kinds.

```text
tool_call + tool_result
        ↓
observed operations (path, name, success/error)
        ↓
Work / handoff
```

## Sprint question

Can the OpenCode handoff name files already touched and whether edits reported success, using only structured source evidence?

## Scope

1. From `tool_call` payloads, record tool name and path/command arguments when present.
2. From matching `tool_result`, record `isError` and a short success/failure note. Do not copy full file contents.
3. Surface those operations on `harnie show` and in the OpenCode handoff (important files + completed vs pending).
4. Tests: Fixture C lists `packages/ai/src/models.ts` and `packages/agent/src/types.ts` as successful edits; Trace B lists `README.md`, `analysis.js`, `config.json`, and pending `read` of `.git/config`.
5. Keep `write`/`read`/`edit`/`bash` as `tool_call`. Classification is a derived/observed facet, not a new event kind.

## Explicit freezes

No live OpenCode run unless the user authorizes it. No model-assisted derivation. No OpenCode DB mutation. No transcript dump of tool results.

## Sprint north star

Tell the next harness what was already touched, so it does not have to discover it again.
