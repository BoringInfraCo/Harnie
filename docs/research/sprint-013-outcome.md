# Sprint 013 Outcome — OpenCode Source Adapter

Status: **GO**  
Evidence cutoff: 2026-09-02

## Sprint question

Can Harnie import an OpenCode session into the same Work model as Pi?

Answer: **yes**, from a sanitized snapshot JSON (and optionally a read-only SQLite DB).

## Pipeline

```text
opencode snapshot JSON (or opencode.db)
        ↓
readOpenCodeSnapshotFile
        ↓
observeOpenCodeSession
        ↓
derive + persist
        ↓
harnie import opencode <path>
```

Work ids: `work:opencode:<session.id>`. Tool `filePath` maps to `arguments.path` so existing operations extraction works. OpenCode tool call+result is one `part`; Harnie emits `tool_call` then `tool_result` with the same `callID`.

## CLI

```text
harnie import pi <path>
harnie import opencode <path>
```

Does not write OpenCode SQLite. Fixture is the sanitized Sprint 012 eval session, not production chat.

## Tests

107 passing, including `tests/opencode-reader.test.ts`, `tests/opencode-observe.test.ts`, `tests/cli-import-opencode.test.ts`.
