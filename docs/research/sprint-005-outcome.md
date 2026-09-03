# Sprint 005 Outcome — Inspect Persisted Observed Work

Status: **GO**  
Evidence cutoff: 2026-09-01

## Sprint question

> Can a developer inspect persisted observed Work well enough to see workspace, source identity, chronology, and unfinished tool activity?

Answer: yes, through `harnie import pi`, `harnie list`, and `harnie show`. Output is observed only. Goal, decisions, and findings are not printed as if they were known.

## Commands

```text
harnie init
harnie import pi <session.jsonl>
harnie list
harnie show <work>
```

`harnie handoff` remains not implemented.

## Trace B through the CLI

Import, list, and show of `tests/fixtures/pi/trace-b-unfinished.jsonl` surface:

- Work id `work:pi:harnie-tb-da82c4f8`
- Workspace `/workspace/pi-project`
- Execution `pi / openai-codex / gpt-5.4` and `pi-session-v3`
- Event counts including `tool_call`
- Diagnostic `missing_tool_result`

A second import still exits 0 with 0 events inserted.

## What shipped

- `src/store/query.ts` — `listWorks`
- `src/cli/import.ts` — `harnie import pi <path>`
- `src/cli/list.ts` — table of work id, workspace, harness, updated
- `src/cli/show.ts` — observed workspace, execution, event counts, diagnostics
- `src/cli.ts` wiring

No semantic derivation. `show` does not emit Goal / Decisions / Findings / Next / Status.

## Tests

57 tests across 12 files, all passing. New coverage:

- `tests/store-list.test.ts`
- `tests/cli-import.test.ts`
- `tests/cli-inspect.test.ts`
- `tests/cli.test.ts` — init → import → list → show through `runCli`

Tests use temp homes and do not write `~/.harnie`.

## Decision

**GO.**

## Sprint 006 recommendation

Derive meaning from observed Work, still locally.

Recommended scope: provenance-backed goal / decision / finding / next-step objects, labeled `derived`, never silently replacing events. Fixture C and Trace B are the primary evidence. Do not implement OpenCode handoff until derived claims are inspectable in `harnie show`.
