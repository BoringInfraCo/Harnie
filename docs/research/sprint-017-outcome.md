# Sprint 017 Outcome — Codex Source Adapter

Status: **GO**  
Evidence cutoff: 2026-09-03

## Sprint question

Can Harnie import a Codex rollout JSONL into the same Work model as Pi and OpenCode?

Answer: **yes**, from invented sanitized rollout JSONL (not production `~/.codex` chats).

## Pipeline

```text
Codex rollout JSONL
        ↓
readCodexJsonlFile
        ↓
observeCodexSession
        ↓
derive + persist
        ↓
harnie import codex <path>
```

Work ids: `work:codex:<session_meta.id>`. `exec_command.cmd` maps to `arguments.command`. `apply_patch` `*** Update File:` maps to `arguments.path`. Typed `reasoning` is `unknown` without copying thinking. Visible `I will` still derives.

## CLI

```text
harnie import pi <path>
harnie import opencode <path>
harnie import codex <path>
```

Does not write `~/.codex`. Does not launch `codex`. No `--to codex` this sprint.

## Tests

128 passing, including `tests/codex-reader.test.ts`, `tests/codex-observe.test.ts`, `tests/cli-import-codex.test.ts`. `npx tsc --noEmit` clean.

Unsupported harness in tests is now `claude` (`codex` is implemented).
