# Sprint 003 Outcome — Observed Work State from Normalized Events

Status: **GO**  
Evidence cutoff: 2026-09-01

## Sprint question

> Can Harnie turn a normalized Pi session into a Work object that is useful without the original harness, while remaining strictly traceable to source evidence?

Answer: yes, for observed facts. A Pi v3 session becomes one Work, one Execution, and a chronological event list. Workspace, source identity, provider/model, tool activity, and provenance are copied from source evidence. Goals, decisions, findings, and next steps are not invented.

## Why this is GO

Trace B, the required unfinished local session, reconstructs as:

```text
work:pi:harnie-tb-da82c4f8
  workspace: /workspace/pi-project
  execution:pi:harnie-tb-da82c4f8  (pi / openai-codex / gpt-5.4 / pi-session-v3)
  events: messages, tool_call, tool_result, unknown
  diagnostics: missing_tool_result on the final read
```

The missing tool result is preserved, not repaired. Every event has `provenance.observation = "observed"` and a source line. A second reconstruction of the same input is identical.

## Pipeline

```text
Pi JSONL
  → SourceRecord[]
  → NormalizedEvent[]
  → ObservedWorkInput   (Pi adapter)
  → Work                (harness-neutral)
```

`reconstructObservedWork` does not import Pi record types. `observePiSession` is the Pi adapter: header `cwd` and timestamp, last `model_change` provider/model, mapped provenance.

## What is observed

- Work and Execution ids from `(harness, source session id)`
- workspace path from v3 header `cwd`
- source session id, harness, source format
- started/updated timestamps present on source records
- provider/model from the last `model_change`, else last assistant envelope
- chronological events with original normalized kinds and payloads
- tool names, arguments, results, `isError`, missing results
- provenance to harness, format, session, entry, line, content index, toolCallId

## What is not reconstructed

These fields are absent from the Work object, not empty arrays:

- title, goal, status
- decisions, findings, artifacts, next steps, context, checkpoints
- `file_read` / `file_write` / command specialization from tool names
- git repository / branch / revision
- `endedAt` (no session-end record exists)

Fixture C contains a stated implementation decision in assistant text. Sprint 003 does not promote that text into a Decision.

## Tests

28 tests across 5 files, all passing. Sprint 003 added 8 tests in `tests/work-observe.test.ts`:

- Trace B: one Work, one Execution, v3, workspace, unfinished call preserved
- Trace A: write/read/bash remain `tool_call`; `isError: true` preserved
- Fixture C: no Decision/goal/finding objects
- every event has observed provenance to a source line
- deterministic ids
- harness-neutral reconstruction without Pi types
- missing session id / workspace diagnostics
- header-only session is valid Work with zero events

## Freeze

No SQLite, CLI, semantic derivation, OpenCode adapter, multi-session grouping, resume, cloud, sync, daemon, MCP, UI, or agent execution.

## Remaining bounds

1. One source session still becomes exactly one Work. Multi-session grouping is later.
2. Work is in-memory only.
3. Provider/model is the last observed `model_change`, not a per-event execution timeline.
4. Source path may be stored on `SourceSession.sourceLocation` and is not part of Work identity.
5. Semantic Work State (goal, decisions, findings, next steps) remains unbuilt.

None of these are NO-GO triggers.

## Decision

**GO.**

Harnie can inspect what a session did without the original harness, and without pretending to know what the work means.

## Sprint 004 recommendation

Persist observed Work.

Recommended scope: a local SQLite Work Store, `harnie init`, and idempotent write of observed Work/Execution/events keyed by `(harness, source_session_id, source_event_id)`. Re-importing Trace B must add zero events the second time.

Do not start semantic derivation or OpenCode handoff in that sprint. Those still need a durable observed baseline.
