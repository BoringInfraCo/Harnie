# Sprint 011 — Live OpenCode scoring rubric (Fixture C)

This scores **actual OpenCode behavior** against IMPLEMENTATION.md step 20, once a continuation transcript exists.

It does **not** score package text. Package sufficiency is already recorded in `docs/research/sprint-010/package-score.md`. Do not copy those present/partial/absent labels here.

No live transcript is invented in this file. If `docs/research/sprint-011/opencode-run-stdout.txt` is absent, empty, or not an OpenCode continuation, overall is **INCOMPLETE** and the per-question items are left unscored.

---

## What this evaluates

Protocol (Sprint 011 / IMPLEMENTATION.md steps 19–20):

```text
OpenCode is given the Fixture C handoff
and asked only “Continue the work.”
```

Handoff used: `docs/research/sprint-010/fixture-c-handoff.md`.

The live workspace is a **sandbox that already contains the 5.3 edits**. The receiving agent did not apply them in this session. Re-applying them is a failure.

---

## Ground truth (Fixture C)

Source session: `tests/fixtures/pi/stateful-prefix.jsonl`  
Work id: `work:pi:ba67782f-c80e-4287-aa82-b8e8d08a839a`

| Fact | Value |
|---|---|
| Goal | The xhigh feature gate supports model 5.2. Extend it to model 5.3 as well. |
| Files | `packages/ai/src/models.ts`, `packages/agent/src/types.ts` |
| Decision | Update the predicate and the public type comment. **Already executed.** |
| Predicate (already in the sandbox) | `return model.id.includes("model-5.2") \|\| model.id.includes("model-5.3");` |
| Type comment (already in the sandbox) | `xhigh is supported by model-5.2 and model-5.3 variants.` |
| Failed approaches | None. Both `rg` calls hit. |
| Unresolved | Verification not recorded (tests, or confirm both files contain 5.3). |
| Correct next work | Verify. Do **not** re-edit. |
| Wrong next work | Re-apply the same predicate/comment patches as if they were never done. |

Pi already:

1. `rg -n "xhigh"` and `rg -n "model-5.2"` (both succeeded)
2. read `packages/ai/src/models.ts`
3. edit that file (succeeded)
4. read `packages/agent/src/types.ts`
5. edit that file (succeeded)

The captured prefix stops there. No tests. No second pass over the files to confirm 5.3.

---

## Labels

### Identify questions (IMPLEMENTATION.md “Can OpenCode identify”)

| Label | Meaning for live behavior |
|---|---|
| **identified** | OpenCode’s tools or statements show it knows this fact. The handoff text containing the fact is not enough. |
| **missed** | No tool call or statement shows it knows this fact. Silence, or proceeding as if the fact were unknown. |
| **contradicted** | Tools or statements assert the opposite of ground truth. |

Score from the transcript only: assistant text, tool names/arguments, tool results, and file writes. A fact that appears only in the *input* handoff does not count as identified until OpenCode uses or restates it.

### Behavior questions (IMPLEMENTATION.md “Does OpenCode”)

| Label | Meaning |
|---|---|
| **yes** | The unwanted (or, for “correct next change”, wanted) behavior occurred. |
| **no** | It did not. |
| **mixed** | Some of both (e.g. confirmatory read of the named files *and* a from-scratch `rg`). |

---

## Evidence to look for

Primary artifact: `docs/research/sprint-011/opencode-run-stdout.txt`.  
Also usable if captured: `opencode-run-stderr.txt`, OpenCode session log, tool-call dump, sandbox `git diff` / file mtimes after the run.

Treat these as **writes** (implementation): `edit`, `write`, `apply_patch`, `str_replace`, or a shell redirect that changes `models.ts` / `types.ts`.

Treat these as **reads** (inspection): `read`, `cat`, `sed -n`, editor open without save.

Treat these as **search** (investigation): `rg`, `grep`, `find`, `glob`, `ls` used to *locate* the gate.

---

## Identify questions

### 1. Original goal

**Ground truth:** extend the xhigh gate from model 5.2 to 5.3.

| Score | Evidence |
|---|---|
| **identified** | States the 5.2→5.3 / xhigh task, or verifies/edits only in service of that gate. |
| **missed** | Never names the goal and the work cannot be read as that task. |
| **contradicted** | Pursues a different task (other models, other features, unrelated refactors) as the work to continue. |

### 2. Completed work

**Ground truth:** both file edits already succeeded. Implementation is done.

| Score | Evidence |
|---|---|
| **identified** | Says the edits already landed, or reads the two files / `git diff` and treats 5.3 as present. Does not queue the same patches as todo. |
| **missed** | Never acknowledges prior edits; unclear whether it thinks implementation is open. |
| **contradicted** | States or implies the predicate/comment are still 5.2-only, or that the patches still need to be applied. Re-edit of the same change is sufficient evidence. |

### 3. Important files

**Ground truth:** `packages/ai/src/models.ts` and `packages/agent/src/types.ts` (full paths).

| Score | Evidence |
|---|---|
| **identified** | Names or opens **both** paths (read, grep *in those files*, test targeting them, or explicit list). |
| **missed** | Uses only `models.ts` (the finding) and never `types.ts`, or never names either path. |
| **contradicted** | Names the wrong files as the gate (e.g. a config, README, or other package) and works there instead. |

Opening extra test/config files in order to *run tests* does not contradict, if both source files are still the gate.

### 4. Decisions already made

**Ground truth:** update the **predicate** and the **public type comment**. That decision is already executed.

| Score | Evidence |
|---|---|
| **identified** | Restates or follows that two-part approach: predicate in `models.ts`, comment in `types.ts`. Treats it as chosen and done, then verifies. |
| **missed** | Never refers to the decision; next actions are unrelated or unexplained. |
| **contradicted** | Chooses a different design (new flag, config bit, other files, only one of the two sites, revert 5.3). |

Future-tense “I will update the predicate…” is **contradicted** if it means implementation is still ahead. It is **identified** only if clearly restating the *already-applied* approach.

### 5. Failed approaches

**Ground truth:** none. Both searches succeeded.

| Score | Evidence |
|---|---|
| **identified** | Does not invent a failure. May note the prior `rg` calls succeeded. Silence is allowed here; prefer **identified** if it simply does not fabricate failures. |
| **missed** | No signal either way, *and* it re-runs discovery as if prior search failed. If it is silent but goes straight to the named files, score **identified**. |
| **contradicted** | Claims a prior approach failed, or treats the Pi `rg`/`edit` as errors. |

This item is **not** a PASS/FAIL input. Fixture C has no failed approaches to recover.

### 6. Current repository state

**Ground truth for this live run:** the sandbox **already contains** the 5.3 predicate and comment. Those two files should look dirty if git is used. The handoff has no branch/revision; OpenCode must learn state from the workspace.

| Score | Evidence |
|---|---|
| **identified** | `git status` / `git diff` / file reads show 5.3 already present, and OpenCode treats that as current. Naming a branch/SHA is extra, not required. |
| **missed** | Never inspects git or file contents; proceeds without a view of the tree. |
| **contradicted** | Claims a clean tree, unpatched 5.2-only sources, or that the files do not yet contain 5.3, when the sandbox already has the edits. |

### 7. Unresolved problem

**Ground truth:** verification outstanding — not another implementation pass.

| Score | Evidence |
|---|---|
| **identified** | Says verification is missing, or starts tests / confirmatory reads / `rg model-5.3` in the two files. |
| **missed** | No mention of verification or remaining work; stops, commits, or wanders without that problem. |
| **contradicted** | Treats the unresolved problem as “apply the 5.3 patches” or any new product gap the prefix does not have. |

Diagnostics `unknown_record_type` in the handoff is parser noise, not the unresolved problem. Treating it as the bug is **contradicted**.

### 8. Appropriate next step

**Ground truth:** verify (run tests, or confirm both files contain 5.3). Do not re-edit.

| Score | Evidence |
|---|---|
| **identified** | Next tool calls or the plan are verification: test runner, confirmatory read of both files, `rg` for `model-5.3` in those files, `git diff` used to confirm the existing patch. Or it reports that remaining work is verification and stops. |
| **missed** | No next step; idle or generic “continue later” without verification. |
| **contradicted** | Next step is re-implementing the predicate and/or comment, or a different feature. |

---

## Behavior questions

### B1. Unnecessarily repeat investigation?

**Yes when:** it re-discovers the gate instead of using the handoff.

Evidence of **unnecessary** investigation:

- `rg` / `grep` for `xhigh` or `model-5.2` across the repo to *find* the files
- listing `packages/` or reading unrelated sources to locate the gate
- re-reading files **other than** the two named paths (and test/harness files needed to verify)

Evidence that is **not** unnecessary investigation:

- reading `packages/ai/src/models.ts` and `packages/agent/src/types.ts` because the handoff named them
- `rg model-5.3` **in those two files** to confirm the patch
- running tests

**no** = goes to the named files (or tests) without a from-scratch search.  
**mixed** = confirmatory reads *plus* a discovery `rg`.

A discovery `rg` alone is not FAIL. Re-edit is.

### B2. Contradict previous decisions?

**Yes when:** it abandons “predicate + public type comment”, or re-opens that decision as unimplemented.

Evidence: edits to other files as the gate; only one of the two sites; revert of 5.3; a new mechanism; statements that a different approach is needed.

**no** = keeps predicate + comment as the approach, already applied.

### B3. Inspect irrelevant files?

**Relevant:** the two source files; tests for them; `package.json` / runner config needed to verify.

**Irrelevant:** README, other packages, `.git/config`, agent configs, files with no xhigh/5.3 role.

**yes** = opens those without a verification reason.  
**no** = stays on the two files and verification tooling.  
**mixed** = one stray read, then back on path.

### B4. Misunderstand current state?

**Yes when:** it treats the 5.3 edits as **not done**.

Evidence:

- “I will update the predicate and type comment” as a plan to execute
- `edit`/`write` with old text still 5.2-only
- “Successfully replaced…” on the same patches
- stating the files still need the 5.3 change after a read that already showed 5.3

**no** = treats 5.3 as present; verification or a report that verification remains.

This is the behavioral twin of identify Q2/Q6/Q7. If B4 is **yes**, overall cannot be PASS.

### B5. Make a correct next change?

**Correct:** verify, or report that remaining work is verification. No file mutation required if it confirms both files already contain 5.3.

Evidence of **yes**:

- test command (`vitest`, `npm test`, `pnpm test`, etc.)
- read both files and state that `model-5.3` is already in the predicate and the comment
- `git diff` / `rg` confirming those strings, then stop or say verification is what is left

Evidence of **no**:

- re-apply the predicate patch
- re-apply the type-comment patch
- write a different implementation of the same gate
- skip verification and also fail to name it as remaining work

Re-read of the two named files in order to confirm 5.3 **is** a correct next change. Re-write of those files **is not**.

---

## Overall pass/fail

Apply **after** the per-question scores. Use only the transcript.

| Overall | When |
|---|---|
| **PASS** | OpenCode treats the 5.3 edits as **done**, **and** either attempts verification **or** reports that remaining work is verification. |
| **FAIL** | OpenCode re-implements the predicate and/or the type comment as if they were never done. |
| **INCOMPLETE** | No continuation transcript (`opencode-run-stdout.txt` missing, empty, or not an OpenCode run). |
| **NOT PASS** | Transcript exists; it does **not** re-implement; it also does **not** verify or name verification as remaining work. |

Rules:

1. **FAIL wins over PASS.** Any re-implementation of the 5.2-only → 5.2+5.3 predicate or comment is FAIL, even if it later runs tests.
2. **INCOMPLETE** if there is nothing to score. Do not infer behavior from the handoff markdown.
3. A confirmatory read of both files that already contain 5.3 counts as attempting verification.
4. Writing tests without re-editing the two sources counts as attempting verification.
5. Commit-only, drive-by refactors, or “done” with no check of 5.3 is **NOT PASS**, not PASS.
6. Extra investigation (B1 **yes**/**mixed**) does not by itself FAIL. It answers the sprint question (less re-investigation?) separately; record it, do not stretch FAIL.

### Re-implementation (FAIL) — concrete tells

Any of these on `packages/ai/src/models.ts` or `packages/agent/src/types.ts`:

- `edit`/`str_replace` from `includes("model-5.2")` to add `model-5.3`
- `edit`/`str_replace` from `xhigh is supported by model-5.2 variants.` to add 5.3
- a full-file `write` whose purpose is to introduce those 5.3 strings as new work
- tool result “Successfully replaced text in …models.ts” / “…types.ts” for that change
- assistant text that it is now applying the gate extension

Not FAIL:

- a no-op edit that does not change the already-correct 5.3 text (still **NOT PASS** if it never verifies)
- editing a **new test file** that asserts 5.3 support
- formatting-only change with 5.3 already present (note it; still not re-implementation)

---

## How to apply (when a transcript exists)

1. Confirm the artifact is a real `opencode run` continuation, not a probe or a handoff reprint.
2. List tool calls in order (name, path/command, write vs read).
3. Score Q1–Q8, then B1–B5, with a one-line evidence cite each (quote or tool line).
4. Apply the overall rule. Do not average the eight identify scores into PASS.
5. Note whether re-investigation was substantially less than a fresh session would need (sprint question). That note is not the PASS/FAIL gate.

Do not score Trace B with this rubric unless a separate Trace B live transcript is captured.

---

## Live score

Evidence cutoff: 2026-09-02.

**Overall: INCOMPLETE.** No continuation behavior to score.

`docs/research/sprint-011/opencode-run-stdout.txt` exists and is **empty** (0 bytes). It is not an OpenCode continuation transcript: no assistant text, no tool calls, no file writes.

`docs/research/sprint-011/opencode-run-stderr.txt` shows the run died before a model turn:

```text
> build · claude-sonnet-4-6
Error: Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.
```

That is a provider billing failure, not Fixture C work. Q1–Q8 and B1–B5 are **unscored**. Do not infer PASS/FAIL from the handoff markdown or from this error.

Re-apply this rubric when a non-empty `opencode-run-stdout.txt` exists.
