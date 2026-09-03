# Sprint 007 Outcome — OpenCode Semantic Handoff

Status: **GO** (implementation). Real OpenCode continuation is not yet scored.  
Evidence cutoff: 2026-09-01

## Sprint question

> Can another harness continue Pi work from Harnie's Work object, without the developer re-explaining the session?

Implementation answer: Harnie can emit a compact OpenCode-oriented handoff from persisted Work. It does not re-parse Pi JSONL and does not write OpenCode's database.

Continuation quality against a live OpenCode session is **not** measured in this sprint. That is the Sprint 008 dogfood experiment.

## Pipeline

```text
loadWork
  → buildHandoffFromWork    (provenance.from = "work")
  → renderOpenCodeHandoff   (markdown continuation prompt)
  → stdout + ~/.harnie/handoffs/<work>.md
```

`harnie handoff <work> --to opencode`

## What is in the package

Goal, current state (unresolved next steps or pending tools only), workspace, execution, decisions, findings, next steps, event counts, diagnostic codes, provenance. No event payloads. No transcript dump.

Current state never claims the work is complete.

## Evidence

- Fixture C: goal matches xhigh/5.3; decision matches “I will”; JSON size much smaller than the session file.
- Trace B: pending tool next step; unresolved current state; no “investigation complete”.
- `buildHandoffFromWork` does not import `src/pi/**`.

## Tests

80 passing across 18 files. New: `tests/handoff.test.ts`, `tests/handoff-opencode.test.ts`, `tests/cli-handoff.test.ts`, plus `runCli` wiring.

## Freeze

No OpenCode SQLite mutation. No Pi → OpenCode session translation.

## Decision

**GO** for the handoff artifact. V0 is not fully proven until someone pastes that artifact into OpenCode and scores continuation.

## Sprint 008 recommendation

Dogfood and evaluate.

Protocol from IMPLEMENTATION.md: start a real Pi task, stop unfinished, `harnie import pi`, `harnie handoff --to opencode`, ask OpenCode only “Continue the work.” Score goal, files, decisions, failed approaches, next change. Do not add features to hide a weak handoff.
