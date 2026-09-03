# Sprint 016 — Live Pi Continuation Dogfood
**Status:** Complete — GO
**Phase:** 2 — Bidirectional harness support
**Type:** Evaluation
**Depends on:** Sprint 014 — GO, Sprint 015 — GO

## Objective

Score a live Pi continuation of OpenCode-imported Work, given only the Harnie `--to pi` handoff and “Continue the work.”

```text
OpenCode (unfinished)
        ↓
harnie import opencode
        ↓
harnie handoff --to pi
        ↓
pi @handoff.pi.md -- "Continue the work."
```

Never convert OpenCode SQLite into Pi JSONL. The handoff is markdown from Work.

## Sprint question

Does Pi continue OpenCode work from Harnie Work with substantially less re-investigation than starting over?

## Scope

1. Dedicated eval clone of this repo (not the live Harnie tree). `--auto` / non-interactive tools only on that clone.
2. Real unfinished OpenCode session in isolated XDG. Production `opencode.db` mtime must not change.
3. `harnie import opencode` + `harnie handoff --to pi` in a temp `HARNIE_HOME`.
4. Pi `--print` with `--session-dir` under `/tmp`, `@<handoff.pi.md>`, prompt only `Continue the work.`
5. Score with the Sprint 012 rubric adapted for Pi as the continuing harness.

## Freeze

No Harnie `src/` changes unless the live run shows a new evidence-backed package hole. Billing/model failures are not package holes. Do not commit private OpenCode DB, Pi JSONL, or `auth.json`. Do not print secrets.
