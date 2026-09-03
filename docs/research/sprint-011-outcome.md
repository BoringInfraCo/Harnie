# Sprint 011 Outcome — Live OpenCode Continuation Gate

Status: **GO** (live Fixture C continuation **PASS** on the sandbox protocol)  
Evidence cutoff: 2026-09-02

## Sprint question

> Does OpenCode continue Fixture C with substantially less re-investigation when given only the Harnie handoff and “Continue the work.”?

Answer: **yes, on this sandbox.** OpenCode treated the 5.3 edits as already done, verified the two files, and did not re-implement them. Prompt text besides the attached handoff was only “Continue the work.”

## Protocol

Disposable workspace `/tmp/harnie-sprint-011-c` already contained the Fixture C post-edit files. Isolated XDG (production `opencode.db` mtime unchanged). Handoff: `docs/research/sprint-010/fixture-c-handoff.md`. `--auto` only because the workspace was throwaway.

## Attempts

1. Specified argv: failed in 1s (`-f` ate `"Continue the work."` as a filename). Lesson: use `--` before the message.
2. Anthropic default `claude-sonnet-4-6`: **credit balance too low**. No tools.
3. Retry `-m opencode/mimo-v2.5-free`: **exit 0** in ~6.5 min.

## Live score (attempt 3)

**PASS** (`docs/research/sprint-011/applied-score.md`).

- Identified goal, completed edits, both files.
- “The edits are already applied and correct.”
- Next work was verification (read + grep), not re-edit.
- `git diff` empty.
- Mixed: re-read the two named files and `README.md` (verification, not a blind hunt).

No unit tests were written. No fresh-session control run.

## What this does not prove

- Not a live Pi session on a real unfinished repo (sandbox reconstructed from Fixture C).
- Default Anthropic model could not run.
- Trace B was not live-tested.
- Fresh OpenCode vs Harnie was not A/B’d.

## Decision

**GO** for the live gate as specified (Fixture C handoff → OpenCode continues without re-doing the edits).

V0 thesis is **supported** by this one continuation, with the limits above. Further product work should not paper over those limits; a real-repo dogfood is optional, not required to close this sprint.

## Sprint 012 recommendation

Optional human dogfood on a real unfinished Pi repo. No required Harnie feature until that run shows a new package hole. CLI note: `handoff` consumers must pass `--` before the prompt if using `opencode run -f`.
