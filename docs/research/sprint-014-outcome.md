# Sprint 014 Outcome — Pi Handoff Renderer

Status: **GO**  
Evidence cutoff: 2026-09-02

## Sprint question

Can Harnie emit a Pi continuation package from Work, including Work imported from OpenCode, without writing Pi JSONL?

Answer: **yes**. `harnie handoff <work> --to pi` renders markdown from Work State.

## Pipeline

```text
Work
  → buildHandoffFromWork
  → renderPiHandoff
  → stdout + $HARNIE_HOME/handoffs/<work>.pi.md
```

Never convert OpenCode SQLite into Pi JSONL. The renderer is markdown. `--to foobar` stays unimplemented.

## CLI

```text
harnie handoff <work> --to opencode   # handoffs/<work>.md
harnie handoff <work> --to pi         # handoffs/<work>.pi.md
```

Does not launch `pi`. Does not write `~/.pi` session files. Does not mutate OpenCode SQLite.

## Tests

113 passing, including `tests/handoff-pi.test.ts` and `tests/cli-handoff-pi.test.ts`.

- OpenCode fixture → `--to pi` is a Pi continuation (mentions continue, `handoff.ts` when present), not JSONL.
- Trace B stays unresolved; does not claim investigation complete.
- Unsupported target `foobar` exits 1.
- `~/.harnie` and `~/.pi/agent/sessions` are unchanged.

`npx tsc --noEmit` clean.

## Bidirectional thesis (Phase 2)

```text
Pi → Harnie → OpenCode     (Phase 0, Sprint 012)
OpenCode → Harnie → Pi     (Sprint 013 import + Sprint 014 --to pi)
```

Live `pi` continuation is not this sprint. Package is markdown for a human or later Pi prompt, same shape as the OpenCode handoff.
