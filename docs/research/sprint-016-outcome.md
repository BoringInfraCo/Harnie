# Sprint 016 Outcome — Live Pi Continuation Dogfood

Status: **GO** (live continuation **PASS** on an eval clone)  
Evidence cutoff: 2026-09-02

## Sprint question

> Does Pi continue OpenCode work from Harnie Work with substantially less re-investigation than starting over?

Answer: **yes, on this clone**, with a weak Pi model. Pi committed the existing `--json` change, ran existing tests, and did not re-implement the flag. Prompt besides `@handoff.pi.md` was only `Continue the work.`

## Protocol

```text
OpenCode prefix (isolated XDG, eval clone, --auto)
        ↓
harnie import opencode (read-only sqlite → snapshot)
        ↓
harnie handoff --to pi
        ↓
pi -p @HANDOFF.pi.md -- "Continue the work."
```

Never converted OpenCode SQLite into Pi JSONL. Production `opencode.db` mtime unchanged. Production `~/.pi` sessions unchanged.

## Live score

**PASS** (`docs/research/sprint-016/applied-score.md`).

OpenCode (mimo-v2.5-free) implemented `--json` in `src/cli/handoff.ts` and left tests/docs open. Pi (nova-micro, `--no-sandbox` on the clone) `git status` → commit that file → `tsc` → existing vitest. No rewrite of the flag.

## Limits

- Eval clone of Harnie, not a second product repo.
- First Pi models: 429 / sandbox `npx` missing / 402 max_tokens. Scored the nova-micro `--no-sandbox` retry.
- Pi did not add `--json` tests; wrap-up mixed “done” vs “tests not started.”
- No fresh-session A/B.

## Decision

**GO.** OpenCode → Harnie Work → `--to pi` markdown is enough for Pi to continue without starting over. No Harnie `src/` change this sprint.
