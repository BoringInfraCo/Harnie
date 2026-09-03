# Sprint 004 Outcome — Local Work Store + Idempotent Observed Import

Status: **GO**  
Evidence cutoff: 2026-09-01

## Sprint question

> Can Harnie persist a reconstructed Work object and import the same Pi session twice without duplicating it?

Answer: yes. Observed Work survives close/reopen of `harnie.db`. A second import of Trace B inserts zero events and keeps the same Work id. A growing session file appends only new events.

## What shipped

```text
observePiSession
        ↓
persistObservedWork  (SQLite, INSERT OR IGNORE on events)
        ↓
loadWork
```

- `src/store/` — paths, schema, `initHarnieStore` / `openHarnieStore`, persist/load
- `src/engine/import.ts` — `importPiSessionFile`
- `src/cli.ts` + `src/cli/init.ts` — `harnie init`
- Tests: store, import, CLI init

Store path: `$HARNIE_HOME/harnie.db` or `~/.harnie/harnie.db`. Tests override home; they do not write the real user store.

SQLite is `node:sqlite` (`DatabaseSync`). No extra native dependency.

## Schema

Tables: `works`, `executions`, `source_sessions`, `events`.

No goal/decision/finding tables. Event uniqueness:

```text
(harness, source_session_id, source_event_id)
```

`source_event_id` is the deterministic Work event id. `provenance_line` is stored as a column so source line remains queryable.

## Idempotency

| Import | Result |
|---|---|
| Trace B first time | Work created, events inserted |
| Trace B second time | `eventsInserted = 0`, same Work id |
| Prefix session, then same session with extra lines | only new events inserted |

## CLI

```text
harnie init
```

Creates the home directory and schema. Second run is success. `import` / `list` / `show` / `handoff` return not-implemented (exit 1).

## Tests

43 tests across 8 files, all passing. Sprint 004 coverage:

- init idempotent; schema has no decision/finding/goal tables
- Trace B persist/reload including `missing_tool_result` and provenance lines
- Trace A write/read/bash remain `tool_call` after reload
- second persist duplicates nothing
- close then `openHarnieStore` reloads the same Work
- `importPiSessionFile` twice is a no-op on events
- growing JSONL appends only new events
- `harnie init` CLI, unknown commands, help

## Freeze

No semantic derivation, no list/show/handoff, no OpenCode, no multi-session grouping.

## Decision

**GO.** Incremental append of a growing session is implemented, so the Conditional GO deferral was not needed.

## Sprint 005 recommendation

Inspect persisted Work.

`harnie list` and `harnie show <work>` over the SQLite store, printing observed workspace, execution, chronology, and diagnostics. Still no goal/decision/finding derivation and no OpenCode handoff.
