# Sprint 012 — Optional Real-Repo Dogfood
**Status:** Complete — GO
**Phase:** 0 — Feasibility
**Type:** Evaluation
**Depends on:** Sprint 011 — GO

## Objective

If desired, repeat the live continuation on a real unfinished Pi session in a real repository (not a reconstructed Fixture C sandbox).

## Sprint question

Does the Fixture C PASS still hold when the workspace and session are the operator’s actual project?

## Scope

Start in Pi, stop unfinished, `harnie import pi`, `harnie handoff --to opencode`, `opencode run -f <handoff> -- "Continue the work."` Score with the Sprint 011 rubric.

## Freeze

No Harnie features unless the live run shows a new evidence-backed package hole. Document that `opencode run -f file -- message` needs `--` so `-f` does not consume the prompt.
