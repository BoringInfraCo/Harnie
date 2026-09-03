# Sprint 013 — OpenCode Source Adapter
**Status:** Complete — GO
**Phase:** 2 — Bidirectional harness support
**Type:** Implementation

## Objective

Import OpenCode sessions into the same Harnie Work model as Pi.

```text
OpenCode SQLite / snapshot JSON
        ↓
observeOpenCodeSession
        ↓
derive + persist
        ↓
harnie import opencode <path>
```

## Scope

1. Conservative read of session / message / part (no OpenCode DB mutation).
2. Normalize to message / tool_call / tool_result / unknown.
3. Map tool `filePath` into `arguments.path` so existing operations extraction works.
4. Sanitized fixture from the Sprint 012 eval session, not production chats.
5. CLI: `harnie import opencode <snapshot.json>`.

## Freeze

No Pi→OpenCode session translation. No writing OpenCode SQLite. No live `opencode run`.
