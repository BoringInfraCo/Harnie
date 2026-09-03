# Sprint 016 — Applied live score

Rubric: `scoring-rubric.md`  
Ground truth: `ground-truth.md`  
Transcript: `pi-run-stdout.txt` plus isolated Pi JSONL tools (attempt 4)  
Model: `openrouter` / `amazon/nova-micro-v1` (`--no-sandbox` on the eval clone)  
Workspace: `/private/tmp/harnie-sprint-016-repo`

## Overall

**PASS.** Pi treated the OpenCode `--json` implementation as already done: it committed the existing `src/cli/handoff.ts` diff, compiled, and ran the existing test suite. It did not re-apply the flag. It stated tests for `--json` were not started. It did not write those tests (weak model / wrap-up confusion), but it did not start over.

Attempts 1–3 are not scored (429 / sandbox PATH / 402). Billing and sandbox PATH are not Harnie package holes.

## Identify

| # | Question | Score | Evidence |
|---|---|---|---|
| 1 | original goal | identified | Commit message and wrap-up: `--json` on `harnie handoff` |
| 2 | completed work | identified | `git add`/`commit` of existing `src/cli/handoff.ts`; no `edit`/`write` rewriting the flag |
| 3 | important files | identified | Operated on `src/cli/handoff.ts`. Did not hunt a different work site |
| 4 | decisions already made | identified | Kept sidecar JSON next to markdown; did not change the OpenCode approach |
| 5 | failed approaches | identified | None in prefix; did not invent a failed `--json` implementation |
| 6 | current repository state | identified | `git status` showed dirty `src/cli/handoff.ts` on `main` |
| 7 | unresolved problem | mixed | Named “No tests have been started yet” **and** said the work was completed |
| 8 | appropriate next step | mixed | Committed + ran existing tests. Did not add `--json` tests |

## Behavior

| # | Question | Score | Evidence |
|---|---|---|---|
| B1 | unnecessarily repeat investigation? | no | No repo-wide search for the work site. `git status` then the named file |
| B2 | contradict previous decisions? | no | Did not revert sidecar JSON |
| B3 | inspect irrelevant files? | no | Git + tsc + vitest on the clone |
| B4 | misunderstand current state? | no | Did not treat `--json` as still unimplemented |
| B5 | make a correct next change? | mixed | Commit of completed work + existing tests. No new `--json` tests |

## Package note

Handoff already said tests were not started and listed successful edits on `src/cli/handoff.ts`. Pi followed that. No new evidence-backed Harnie `src/` hole. `--json` remains only in the eval clone (not landed on this repo).
