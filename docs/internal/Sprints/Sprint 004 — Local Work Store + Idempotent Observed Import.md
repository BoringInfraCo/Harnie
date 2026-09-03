# Sprint 004 — Local Work Store + Idempotent Observed Import
**Status:** Complete — GO
**Phase:** 0 — Feasibility
**Type:** Implementation
**Depends on:** Sprint 003 — GO

## Objective

Make observed Work durable on the local machine without changing what Harnie believes.

```text
Observed Work
        ↓
SQLite Work Store
        ↓
idempotent re-import
```

This sprint does not decide what the work means. It remembers what was observed.

## Sprint question

Can Harnie persist a reconstructed Work object and import the same Pi session twice without duplicating it?

## Scope

### 1. Local store

Create `~/.harnie/harnie.db` (or a test-overridable path).

Tables should map to Sprint 003 objects:

```text
works
executions
source_sessions
events
```

JSON is acceptable for event payloads. Provenance must remain queryable enough to answer which source line produced an event.

### 2. `harnie init`

Idempotent initialization of the Harnie home directory and schema. No account wizard.

### 3. Persist observed Work

A library import path (CLI `harnie import pi` may exist if it stays thin) should:

```text
read Pi JSONL
  → observePiSession
  → persist Work
```

Do not mutate Pi source files.

### 4. Idempotency

Identity:

```text
harness
source_session_id
source_event_id
```

Expected:

```text
First import of Trace B
+ Work, Execution, events

Second import of Trace B
+ 0 events, same Work id
```

If the source session later gains records, a third import may append only the new events. If that incremental case is too large for this sprint, document it as the Sprint 005 condition and still prove the identical-file no-duplication case.

### 5. Tests

- init is idempotent
- Trace B persists and reloads workspace, execution, missing tool result
- Trace A write/read/bash remain `tool_call` after reload
- second import of the same file duplicates nothing
- no Decision/goal/finding rows are created

### 6. Explicit freezes

Do **not** implement:

- semantic or model-assisted derivation
- `harnie list` / `show` / `handoff` beyond what is required to prove persistence
- OpenCode adapter
- multi-session Work grouping
- native resume
- cloud, sync, daemon, MCP, UI, agent execution

## Decision criteria

**GO** if observed Work survives a process restart and a second import of the same session is a no-op.

**CONDITIONAL GO** if persistence works but incremental append of a growing session is deferred with an explicit later condition.

**NO-GO** if reload drops provenance, duplicates events, or requires guessing to store the session.

## Sprint north star

Remember what happened before asking another harness to continue it.
