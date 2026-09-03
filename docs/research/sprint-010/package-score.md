# Sprint 010 — Package score

Evidence cutoff: 2026-09-02.

This scores **package sufficiency** of the OpenCode continuation prompt against IMPLEMENTATION.md step 20. It is not a live OpenCode run. No claim is made about how OpenCode would behave if pasted this text. `opencode run` was not executed.

Scored artifacts (sibling capture, `runCli` on a temp `HARNIE_HOME`; independently reproduced via `importPiSessionFile` → `loadWork` → `buildHandoffFromWork` → `renderOpenCodeHandoff`, byte-identical):

- `docs/research/sprint-010/fixture-c-handoff.md` (1177 bytes)
- `docs/research/sprint-010/trace-b-handoff.md` (1055 bytes)

Compared against the source JSONL only as ground truth, not as part of the package:

- Fixture C: `tests/fixtures/pi/stateful-prefix.jsonl` (6685 bytes, 14 records; prefix of 21)
- Trace B: `tests/fixtures/pi/trace-b-unfinished.jsonl` (5098 bytes, 13 records; stops mid-`read`)

`harnie show` was captured alongside the handoff (`fixture-c-show.txt`, `trace-b-show.txt`). It now prints Operations, still has no Files touched / Current state, and is **not** the continuation prompt. Scores below are for the handoff markdown only.

Sprint 008 baseline: `docs/research/sprint-008/package-score.md`.

## Rubric

| Label | Meaning |
|---|---|
| **present** | receiving agent can know this from the handoff without the transcript |
| **partial** | hinted or incomplete |
| **absent** | not in the handoff |
| **misleading** | handoff implies something false |

---

## Scores

| # | Question | Fixture C | Trace B |
|---|---|---|---|
| 1 | original goal | **present** | **present** |
| 2 | completed work | **present** | **partial** |
| 3 | important files | **present** | **present** |
| 4 | decisions already made | **present** | **absent** |
| 5 | failed approaches | **absent** | **absent** |
| 6 | current repository state (branch / revision / dirty files) | **absent** | **absent** |
| 7 | unresolved problem | **present** | **partial** |
| 8 | appropriate next step | **partial** | **present** |

---

## Sprint 008 → Sprint 010

| # | Question | Fixture C | Trace B |
|---|---|---|---|
| 1 | original goal | present → **present** | present → **present** |
| 2 | completed work | **misleading** → **present** | absent → **partial** |
| 3 | important files | partial → **present** | absent → **present** |
| 4 | decisions already made | present → **present** | absent → **absent** |
| 5 | failed approaches | absent → **absent** | absent → **absent** |
| 6 | current repository state | absent → **absent** | absent → **absent** |
| 7 | unresolved problem | absent → **present** | partial → **partial** |
| 8 | appropriate next step | absent → **partial** | partial → **present** |

Sprint 009’s declared holes **closed**. The remaining 008 holes that were not in Sprint 009’s scope (git identity, Trace B findings / result text, Fixture C explicit next-step list) did **not**.

---

## Sprint 009 hole check

These were the promotion conditions from Sprint 008 / the Sprint 009 freeze. Checked against the 010 handoff markdown, not against tests.

### Fixture C — closed

| Must | Result |
|---|---|
| name `packages/ai/src/models.ts` and `packages/agent/src/types.ts` | **yes** — both in `## Files touched`, `## Operations`, and `## Current state` |
| not invite re-doing those edits as if never done | **yes** — current state: “Edits reported success on packages/ai/src/models.ts, packages/agent/src/types.ts.” Operations: `edit …/models.ts — succeeded`, `edit …/types.ts — succeeded` |
| still compact, not a transcript dump of file contents | **yes** — 1177 B vs 6685 B JSONL (0.176). No predicate source, no diffs, no “Successfully replaced text…” bodies |

### Trace B — closed

| Must | Result |
|---|---|
| name `README.md`, `analysis.js`, `config.json` | **yes** — all three in Files touched and as `read … — succeeded` |
| pending read of `.git/config` | **yes** — `read .git/config — pending`; next step “Complete pending tool call read .git/config”; current state the same sentence |
| not claim investigation complete | **yes** — current state starts with `Unresolved:`; no “investigation complete” / “refactoring plan ready” |

---

## Fixture C — `stateful-prefix.jsonl`

Transcript facts: extend xhigh from model 5.2 to 5.3; decision “I will update that predicate and its public type comment.”; files `packages/ai/src/models.ts` and `packages/agent/src/types.ts`; both `edit` results reported success; verification is not in the captured prefix.

### 1. original goal — present

> “The xhigh feature gate supports model 5.2. Extend it to model 5.3 as well.”

Unchanged from Sprint 008. First user message, copied in full.

### 2. completed work — present

Sprint 008 scored this **misleading** because the only progress sentence was future-tense “I will update…”. That lie is gone from current state.

Now:

> “Edits reported success on packages/ai/src/models.ts, packages/agent/src/types.ts. Verification not recorded.”

and

> “edit packages/ai/src/models.ts — succeeded”
> “edit packages/agent/src/types.ts — succeeded”

A receiver who reads Current state or Operations cannot honestly treat the patches as still to-do. The `## Decisions` line is still “I will update that predicate and its public type comment.” That is the chosen approach, not a second claim that the files are untouched. Residual risk: an agent that treats Decisions as a todo list and skips Current state / Operations. That is carelessness, not a package falsehood. Not scored misleading.

Tool-result text (“Successfully replaced text in …”) and the actual diffs are **not** in the package. Status `succeeded` is enough to know the edits landed.

### 3. important files — present

Full paths, not basenames:

> “packages/ai/src/models.ts”
> “packages/agent/src/types.ts”

They appear three times (Files touched, Operations, Current state). Sprint 008 had only “The gate is centralized in models.ts”. Closed.

### 4. decisions already made — present

> “I will update that predicate and its public type comment.”

Same sentence as 008. Enough to know the approach (predicate + public type comment). Execution of that decision is now in question 2, not missing from the package.

### 5. failed approaches — absent

No failed-approach field. The transcript has none (both `rg` calls hit). Omission is not a lie.

The searches themselves are now visible:

> “bash rg -n "xhigh" --type ts — succeeded”
> “bash rg -n "model-5.2" --type ts — succeeded”

Workspace path is stripped from the command (`/workspace/pi-project` is gone from the `rg` line). Hits (`types.ts:102`, `models.ts:53`) are gone. A receiver is less likely to re-discover the gate from zero, more likely to re-run `rg` for the actual matching lines. Not scored misleading.

### 6. current repository state — absent

Only:

> “Workspace `/workspace/pi-project`”

No branch, no revision, no dirty list. Successful edits imply those two files would be dirty; that is completed work (Q2), not a git snapshot. Nothing says `HEAD`, branch name, or `git status`. Unchanged from 008.

### 7. unresolved problem — present

Sprint 008 had no unresolved-problem sentence. The prefix’s outstanding problem is **verification**, not another edit. Current state now ends:

> “Verification not recorded.”

That is the product gap. Diagnostics still include `unknown_record_type` (parser noise for `model_change` / `thinking_level_change`). If treated as work health it remains a red herring; it is no longer the only diagnostic in the package.

### 8. appropriate next step — partial

No `## Next steps`. The right continuation is: verify (and do not re-edit). Current state implies that. It does not say “run tests”, “re-read the predicate”, or “confirm `model-5.3` is in `supportsXhigh`”. A receiver can still invent a next action (commit, write tests, re-apply a slightly different patch). Better than 008’s empty future-tense invitation. Not a next-step list.

---

## Trace B — `trace-b-unfinished.jsonl`

Transcript facts: investigate and propose a refactoring plan; already read `README.md`, `analysis.js`, `config.json`; `ls` and `git log` (`47da672 initial`) returned; stopped mid-`read` of `.git/config` with no tool result. Must not claim the investigation is complete.

### 1. original goal — present

Full user prompt under `## Goal`, including “propose a refactoring plan.” Unchanged.

### 2. completed work — partial

Sprint 008: findings empty, event counts only, **no inventory**. Now there is an inventory:

> “read README.md — succeeded”
> “read analysis.js — succeeded”
> “read config.json — succeeded”
> “bash ls -la — succeeded”
> “bash git log --oneline -5 — succeeded”
> “read .git/config — pending”

That is *what was invoked*, not *what was learned*. Findings are still omitted (assistant turns were whitespace + tool calls, so `assistant-after-tools` still extracts nothing). Result text is dropped from operation lines: no “# Mystery Project”, no `{"config": "incomplete"}`, no `ls` tree, no `47da672 initial`. A receiver knows the three files were already read and still has to re-read them to analyze. Not absent. Not present.

### 3. important files — present

> “README.md”
> “analysis.js”
> “config.json”
> “.git/config”

Sprint 008 had zero paths. The 008 user-note exception (“missing path on the Trace B next step is OK if paths appear in findings”) is unnecessary: paths are in Files touched, Operations, Current state, and Next steps.

Minor trap: Files touched lists `.git/config` next to the three succeeded reads, with no status. Operations and Current state mark it pending. An agent that only skims Files touched could think `.git/config` was already consumed. Not enough to score misleading; the pending line is explicit.

### 4. decisions already made — absent

No `## Decisions`. Correctly does not invent a refactoring plan. Still does not say “no decisions yet,” so a receiver cannot distinguish “none made” from “derivation dropped them.” Unchanged. Not misleading.

### 5. failed approaches — absent

None in the transcript; none in the package. Same as Fixture C.

### 6. current repository state — absent

Workspace path only. The JSONL had `git log --oneline -5` → `47da672 initial` and an `ls` of a three-file tree plus `.git`. The package now *names* those commands as succeeded and then throws the results away. That is worse than silence in one respect: it advertises git history was read and withholds the SHA. No branch. Dirty files: none expected (reads only). The in-flight `.git/config` read is named as pending (Q7/Q8), not as repo state.

### 7. unresolved problem — partial

Does **not** claim investigation complete. Good. Path is now on the sentence:

> “Unresolved: Complete pending tool call read .git/config”

Sprint 008 reduced the real problem (investigation unfinished, then a refactoring plan is still required) to a mechanical pending `read` with no path. The path is fixed. The reduction is not: the user-level unresolved work is still only in the original goal. `missing_tool_result` is accurate. `unknown_record_type` is still noise.

### 8. appropriate next step — present

> “Complete pending tool call read .git/config”

Sprint 008: right *kind* of action, wrong specificity (path missing). The path is here, in Next steps, Current state, and Operations. That is the correct immediate continuation from this prefix.

After that read, the actual task (analyze, then propose a plan) is only in the original goal, with no progress marker and no findings to analyze from. The header “Do not re-investigate from scratch” can now be followed for *which* files were seen, not for *what they contained*. That remaining hole is scored under Q2, not by holding Q8 at partial.

---

## Reformatted transcript?

**No.** Still over-compression of *results*, not a restated log. Operations are a new skeleton (tool, path/command, status), not payloads.

| Item | JSONL | Handoff md | Handoff / JSONL | vs 008 handoff |
|---|---:|---:|---:|---:|
| Fixture C | 6685 B / 14 lines | 1177 B / 48 lines | 0.176 | 673 B → 1177 B (+504, ×1.75) |
| Trace B | 5098 B / 13 lines | 1055 B / 48 lines | 0.207 | 746 B → 1055 B (+309, ×1.41) |

Event payloads, diffs, file bodies, `rg` hits, `ls` listing, and `47da672` are still dropped. V0’s “handoff approaches transcript size” failure does **not** fire. Growth is the Operations / Files touched / Current state lines Sprint 009 required.

## Would a developer still have to manually explain the task?

| Fixture | Sprint 008 | Sprint 010 |
|---|---|---|
| C | **partial** — goal and decision named the task; developer still had to say both files were already edited | **no** — goal, both full paths, both edits succeeded, verification outstanding |
| B | **yes** — developer had to list files already read and that work stopped on `.git/config` | **partial** — those names are in the package; developer still has to supply what the files contained (or accept re-reads) |

Unattended “Continue the work.” with only this markdown: Fixture C no longer needs the developer as memory of progress. Trace B still does, for investigation yield.

## Gaps that force re-investigation

Package holes, not observed OpenCode behavior.

**Fixture C — 008 holes that closed**

- Full paths `packages/ai/src/models.ts` and `packages/agent/src/types.ts` now appear.
- Edit success is stated; re-implementation is no longer the honest reading.
- Verification outstanding is stated.

**Fixture C — still open**

- No `## Next steps`; verify is implied, not instructed.
- No branch / revision / dirty list.
- `rg` match lines and edit diffs are gone, so a cautious agent may re-read both files (re-read is cheaper than re-edit; the 009 bar was re-edit).
- “I will update…” remains in Decisions (approach, not a todo — but still future-tense).

**Trace B — 008 holes that closed**

- `README.md`, `analysis.js`, `config.json` are named.
- Next step names `.git/config`.
- Does not claim the investigation is complete.

**Trace B — still open**

- Findings empty, so file contents and even first-line notes never reach the prompt.
- `ls` tree and `47da672` are gone despite `bash … — succeeded`.
- Header forbids re-investigation; the package still cannot substitute for the three successful reads.
- After `.git/config`, “propose a refactoring plan” is only in the goal.

## Verdict

Sprint 009’s file-path / edit-success holes **closed**. The handoff is still compact, Work-backed, and not a reformatted transcript.

**Fixture C is sufficient** for unattended “Continue the work.” A receiver can identify the goal, both files, that both edits already succeeded, and that verification is what is left. They should not re-apply the patches.

**Trace B is still insufficient** for unattended “Continue the work.” A receiver can identify the goal, the files already touched, and the pending `.git/config` read, and will not think the investigation is done. They cannot continue the *analysis* without re-reading everything the session already opened. “Do not re-investigate from scratch” is still an instruction the package cannot back.

**Package still insufficient** as a two-fixture continuation prompt. Git identity (branch / revision / dirty files) is absent on both. Fixture C’s next step is implied. Trace B’s completed work is a tool log without yield.

This is a **package** verdict. Live OpenCode continuation was not run and is not scored here.
