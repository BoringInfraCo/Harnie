# Sprint 008 — Package score

Evidence cutoff: 2026-09-01.

This scores **package sufficiency** of the OpenCode continuation prompt against IMPLEMENTATION.md step 20. It is not a live OpenCode run. No claim is made about how OpenCode would behave if pasted this text.

Scored artifacts (sibling capture, byte-identical to `importPiSessionFile` → `loadWork` → `buildHandoffFromWork` → `renderOpenCodeHandoff` on a temp `HARNIE_HOME`):

- `docs/research/sprint-008/fixture-c-handoff.md` (673 bytes)
- `docs/research/sprint-008/trace-b-handoff.md` (746 bytes)

Compared against the source JSONL only as ground truth, not as part of the package:

- Fixture C: `tests/fixtures/pi/stateful-prefix.jsonl` (6685 bytes, 14 records; prefix of 21)
- Trace B: `tests/fixtures/pi/trace-b-unfinished.jsonl` (5098 bytes, 13 records; stops mid-`read`)

`harnie show` was captured alongside the handoff. It has the same semantic holes (no paths, no edit success, no git state) and is **not** the continuation prompt. Scores below are for the handoff markdown only.

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
| 2 | completed work | **misleading** | **absent** |
| 3 | important files | **partial** | **absent** |
| 4 | decisions already made | **present** | **absent** |
| 5 | failed approaches | **absent** | **absent** |
| 6 | current repository state (branch / revision / dirty files) | **absent** | **absent** |
| 7 | unresolved problem | **absent** | **partial** |
| 8 | appropriate next step | **absent** | **partial** |

---

## Fixture C — `stateful-prefix.jsonl`

Transcript facts: extend xhigh from model 5.2 to 5.3; decision “I will update that predicate and its public type comment.”; files `packages/ai/src/models.ts` and `packages/agent/src/types.ts`; both `edit` results reported success; verification is not in the captured prefix.

### 1. original goal — present

> “The xhigh feature gate supports model 5.2. Extend it to model 5.3 as well.”

That is the first user message, copied in full. A receiver knows the task.

### 2. completed work — misleading

The session already applied both edits (`Successfully replaced text in …/models.ts` and `…/types.ts`). The handoff never says so.

What it does say is future-tense:

> “I will update that predicate and its public type comment.”

There is no `## Current state` and no `## Next steps`. The header is “Continue this work.” The matched counts (`tool_call: 6` / `tool_result: 6`) only show that *some* tools returned, not that the predicate and type comment already landed. A receiver can honestly read this as “decision made, implementation still to do,” and re-apply patches that already succeeded.

### 3. important files — partial

Finding:

> “The gate is centralized in models.ts”

Basename only. The real path is `packages/ai/src/models.ts`. `packages/agent/src/types.ts` is not named anywhere, even though it was read and edited. “public type comment” in the decision does not identify the file.

### 4. decisions already made — present

> “I will update that predicate and its public type comment.”

Matches the assistant sentence. Enough to know the chosen approach (predicate + comment), not enough to know it was already executed (that is question 2).

### 5. failed approaches — absent

No failed-approach field, and the transcript has none (both `rg` calls hit). Omission is not a lie. The receiver also cannot know those searches already ran, so they are likely to repeat investigation. Not scored misleading.

### 6. current repository state — absent

Only:

> “Workspace `/workspace/pi-project`”

No branch, no revision, no dirty list. After two successful edits the tree would be dirty on those two files. Nothing in the package says that.

### 7. unresolved problem — absent

The captured prefix’s outstanding problem is **verification**, not another edit. The handoff has no unresolved-problem sentence. The only diagnostic is:

> “unknown_record_type”

That code is parser noise (`model_change` / `thinking_level_change`), not a product defect. If treated as work health it is a red herring.

### 8. appropriate next step — absent

No next-step list. The appropriate continuation from the prefix is verify (and do not re-edit). The package leaves the receiver to invent a next action from a future-tense decision.

---

## Trace B — `trace-b-unfinished.jsonl`

Transcript facts: investigate and propose a refactoring plan; already read `README.md`, `analysis.js`, `config.json`; `ls` and `git log` (`47da672 initial`) returned; stopped mid-`read` of `.git/config` with no tool result. Must not claim the investigation is complete.

### 1. original goal — present

Full user prompt is under `## Goal`, including “propose a refactoring plan.”

### 2. completed work — absent

Five successful tool results exist in the JSONL. Findings is empty (assistant turns were whitespace + tool calls, so `assistant-after-tools` extracted nothing). Event summary (`tool_call: 6`, `tool_result: 5`) does not name `README.md`, `analysis.js`, `config.json`, the directory listing, or the git SHA. A receiver has no inventory of what was already read.

### 3. important files — absent

Zero file paths in the handoff. The user-note exception (“missing path on the Trace B next step is OK if paths appear in findings”) does **not** apply: findings are omitted entirely.

### 4. decisions already made — absent

No `## Decisions` section. Correctly does not invent a refactoring plan. Also does not say “no decisions yet,” so a receiver cannot distinguish “none made” from “derivation dropped them.” Not misleading: nothing claims a plan exists.

### 5. failed approaches — absent

None in the transcript; none in the package. Same as Fixture C.

### 6. current repository state — absent

Workspace path only. The JSONL already had `git log --oneline -5` → `47da672 initial` and an `ls` of a three-file tree plus `.git`. None of that is lifted. No branch. The in-flight `.git/config` read is not named.

### 7. unresolved problem — partial

Does **not** claim investigation complete. Good.

> “Unresolved: Complete pending tool call read”
> “missing_tool_result”

The real unresolved problem is: investigation is unfinished, then a refactoring plan is still required. The package reduces that to a mechanical pending `read`. `unknown_record_type` is again noise.

### 8. appropriate next step — partial

> “Complete pending tool call read”

Right *kind* of action (finish the unmatched `read`). Wrong specificity: the path is `.git/config`, and it is not in this line or in findings. After that read, the actual task (analyze, then propose a plan) is only in the original goal, with no progress marker.

The header “Do not re-investigate from scratch” cannot be followed: there is no record of files already seen.

---

## Reformatted transcript?

**No.** Inverse failure: over-compression, not a restated log.

| Item | JSONL | Handoff md | Handoff / JSONL |
|---|---:|---:|---:|
| Fixture C | 6685 B / 14 lines | 673 B / 33 lines | 0.101 |
| Trace B | 5098 B / 13 lines | 746 B / 34 lines | 0.146 |

Event payloads, diffs, commands, tool-result text, and file paths are dropped. What remains is a short semantic skeleton (goal, one decision, one finding or one pending-tool next step, counts, diagnostics). Far below transcript size; also below what a continuation agent needs.

## Would a developer still have to manually explain the task?

| Fixture | Answer |
|---|---|
| C | **partial** — goal and decision are enough to name the task; a developer still has to say both files were already edited, give the full paths, and that verification is what is left |
| B | **yes** — goal is in the package; a developer still has to list the files already read and that work stopped on `.git/config` |

Unattended “Continue the work.” with only this markdown: the developer is still the memory for progress, files, and next change.

## Gaps that force re-investigation

These are package holes, not observed OpenCode behavior.

**Fixture C**

- Full paths `packages/ai/src/models.ts` and `packages/agent/src/types.ts` never appear.
- Successful edit diffs / “Successfully replaced text” never appear.
- Verification outstanding is not stated, so the next change is undefined.
- `rg` hits for `xhigh` / `model-5.2` are gone, so search will be repeated.
- “I will update…” plus no current state invites re-implementation.

**Trace B**

- No findings, so `README.md`, `analysis.js`, `config.json` contents and even names are gone.
- Next step names the tool (`read`) not the path (`.git/config`).
- `ls` tree and `47da672` are gone.
- Header forbids re-investigation while the package contains nothing that substitutes for it.

## Verdict

**Package insufficient** for a continuation prompt.

The artifact is compact, Work-backed, and not a reformatted transcript. Fixture C carries a usable goal and the “I will” decision. Trace B correctly stays unresolved and does not claim the investigation is complete. That is not enough.

A receiving agent still cannot answer, from the package alone: what already changed, which files matter, what the repo looks like, what failed (or already succeeded), or what to do next without guessing. Fixture C is actively misleading on completed work. Trace B omits every file it already touched.

This is a **package** verdict. Live OpenCode continuation was not run and is not scored here.
