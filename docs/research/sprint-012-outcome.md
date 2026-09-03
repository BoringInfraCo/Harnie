# Sprint 012 Outcome — Optional Real-Repo Dogfood

Status: **GO** (live continuation **PASS** on an eval clone of Harnie)  
Evidence cutoff: 2026-09-02

## Sprint question

> Does the Fixture C PASS still hold when the workspace and session are the operator’s actual project?

Answer: **yes, on a dedicated clone of this Harnie working tree.** OpenCode continued a live Pi session: it read the same three files Pi had read and implemented the first `--json` change. It did not treat the files as unread.

## What we created

Pi in `/tmp/harnie-sprint-012-repo` (rsync of this repo, real `src/cli/handoff.ts` etc.). Task: add `--json` to `harnie handoff`. Model `amazon/nova-micro-v1` after `kimi-k2.6` OpenRouter 402.

Pi **read** the three files (six successful reads) and **did not edit**. Session ended with a confused wrap-up. Implementation still unfinished. Raw JSONL stays in `/tmp` (not committed).

## Handoff

`harnie import` / `handoff --to opencode` in temp `HARNIE_HOME`. Files touched and operations are correct. Decisions/findings include Nova-micro thinking (“cannot read files”) that **contradicts** operations. OpenCode ignored that and followed goal + operations.

## Live OpenCode

Isolated XDG; production DB mtime unchanged. `--auto` on the clone only. `opencode/mimo-v2.5-free`. Prompt besides the file: `Continue the work.` (`--` required).

~40s, exit 0. Read the three files, edited `src/cli/handoff.ts` to parse `--json` and write `.json` next to markdown. Tests/docs left undone. **PASS.**

## Package hole (documented, not patched)

Derivation still lifts `I will` / sentences from assistant **thinking** into Decisions/Findings. That confused the package; it did not block continuation. Freeze: no Harnie `src/` change this sprint.

## Limits

- Eval clone of Harnie, not a second unrelated product repo.
- Weak Pi model; OpenRouter default model 402.
- No fresh-session A/B.
- `--json` exists only in `/tmp/harnie-sprint-012-repo`, not in this working tree.

## Decision

**GO.** Fixture C’s “continue from Work without starting over” held on a real Harnie tree and a live Pi session.
