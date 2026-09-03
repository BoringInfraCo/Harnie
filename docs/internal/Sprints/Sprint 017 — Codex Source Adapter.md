# Sprint 017 — Codex Source Adapter
**Status:** Complete — GO
**Phase:** 2 — Bidirectional harness support
**Type:** Implementation
**Depends on:** Sprint 016 — GO

## Objective

Import Codex rollout JSONL into the same Harnie Work model as Pi and OpenCode.

```text
Codex rollout JSONL
        ↓
observeCodexSession
        ↓
derive + persist
        ↓
harnie import codex <path>
```

Never convert Codex JSONL into Pi JSONL or OpenCode SQLite.

## Scope

1. Conservative read of `type` / `payload` / `timestamp` records. Do not write `~/.codex`.
2. Normalize `response_item` to `message` / `tool_call` / `tool_result` / `unknown`.
3. Map tool args so existing operations extraction works: `exec_command.cmd` → `arguments.command`; `apply_patch` `*** Update File:` → `arguments.path`.
4. Skip reasoning as Work meaning (typed `reasoning` items → `unknown` without copying chain-of-thought). Visible `input_text` / `output_text` still derive.
5. Sanitized **invented** fixture under `tests/fixtures/codex/`, not production chats.
6. CLI: `harnie import codex <rollout.jsonl>`. Work ids: `work:codex:<session_meta.id>`.
7. Tests that used `codex` as an unimplemented harness must switch to another name (e.g. `claude`).

## Freeze

No live `codex` process. No `~/.codex` mutation. No Codex→Pi session translation. No `--to codex` handoff this sprint.
