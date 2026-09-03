# Codex session ground truth

Evidence cutoff: 2026-09-03  
Sprint: 017 — Codex Source Adapter  
Scope: local read-only inspection of Codex CLI rollout JSONL. No production chat text is copied here.

## Result in one sentence

Codex CLI (`codex-cli 0.149.1`) stores sessions as dated `rollout-*.jsonl` under `~/.codex/sessions/YYYY/MM/DD/`. Records are `{type, timestamp, payload}`. Enough structure exists to observe messages and tool calls into Harnie Work.

## Storage

- Home: `~/.codex` (override via Codex config / `CODEX_HOME` if present).
- Rollout path: `~/.codex/sessions/<year>/<month>/<day>/rollout-<ISO>-<uuid>.jsonl`
- Filename UUID is recoverable; `session_meta.payload.id` is the session id.

## Top-level record types (observed)

| `type` | Role for Harnie |
|---|---|
| `session_meta` | Header: `id`, `cwd`, `source` (`cli`/`vscode`), `cli_version`, `originator`, optional `git` |
| `response_item` | Work events: `payload.type` is the item kind |
| `event_msg` | Telemetry / UI (`token_count`, `user_message`, `agent_message`, …). Not Work meaning |
| `turn_context` | Model / cwd / sandbox for a turn. Header-adjacent, not an event |
| `world_state` | Skip / unknown |
| `compacted` | May contain `replacement_history`; V0 may ignore and still parse later `response_item`s |

## `response_item.payload.type` (observed)

| Item | Maps to |
|---|---|
| `message` | `message`; `role` user/assistant; content blocks `input_text` / `output_text` with `text` |
| `function_call` | `tool_call`; `name`, `call_id`; `arguments` is a **JSON string**. `exec_command` args include `cmd` |
| `function_call_output` | `tool_result`; `call_id`; `output` often a string |
| `custom_tool_call` | `tool_call`; names observed: `exec`, `apply_patch`; `input` is a string; `status` e.g. `completed` |
| `custom_tool_call_output` | `tool_result`; `output` string or list |
| `reasoning` | `unknown`; do not copy thinking text into message content |
| `agent_message` | treat as unknown or assistant message only if it has visible text blocks |

## Operations mapping

Existing `extractToolOperations` reads `payload.arguments.path` and `payload.arguments.command`.

- `exec_command`: parse `arguments` JSON; set `arguments.command` from `cmd`.
- `custom_tool_call` `exec`: `arguments.command` from `input` when it is a string.
- `apply_patch`: parse `*** Update File: <path>` (also Add/Delete) from `input` into `arguments.path`.

Do not treat `workdir` as a file path.

## Fixture policy

Committed JSONL is **invented and sanitized** (`/workspace/codex-project`). Do not add production `~/.codex` rollouts.

## Isolation

Import is read-only on the given path. Tests must not write `~/.codex` or launch `codex`.
