# Sprint 012 — Live OpenCode scoring rubric (real repo)

This scores **actual OpenCode behavior** against IMPLEMENTATION.md step 20 on a **real unfinished Pi session in a real repository**, once a continuation transcript exists.

It is the Sprint 011 rubric adapted for a session that is **unknown until discovery**. Do not copy Fixture C facts (xhigh / 5.3 / `models.ts`) into the ground-truth table. Fill that table from the chosen Pi session and workspace **after** discovery, independently of OpenCode’s later output.

It does **not** score package text. Package sufficiency is already recorded in `docs/research/sprint-010/package-score.md`. Do not copy those present/partial/absent labels here. Sprint 011’s Fixture C **PASS** does not carry over; this is a new live run.

No live transcript is invented in this file. If `docs/research/sprint-012/opencode-run-stdout.txt` is absent, empty, or not an OpenCode continuation, overall is **INCOMPLETE** and the per-question items are left unscored. Do not create empty stdout files as a stand-in.

**Applied 2026-09-02 (discovery):** no pre-existing real-repo unfinished session.

**Applied 2026-09-02 (created session):** live Pi in an eval clone of Harnie; OpenCode continuation transcript exists. **Overall: PASS.** See `applied-score.md`.

## Harnie freeze

No `src/` changes unless the live run shows a **new evidence-backed package hole**. A billing failure, a missing transcript, or a session that has not been chosen is not a package hole.

---

## What this evaluates

Protocol (Sprint 012 / IMPLEMENTATION.md steps 19–20):

```text
Start in Pi, stop unfinished.
harnie import pi
harnie handoff --to opencode
OpenCode is given only the Harnie handoff file
and asked only “Continue the work.”
```

Do not manually summarize the Pi session. The prompt text besides the attached handoff is only `Continue the work.`

The workspace is the operator’s **actual project** (or a dedicated eval clone of it), not `/tmp/harnie-sprint-011-c` and not a reconstructed Fixture C sandbox. `--dir` must point at that workspace, not the Harnie repo.

Handoff used: the file produced by `harnie handoff <work> --to opencode` for the chosen work *(path filled after discovery)*.

---

## Required `opencode run` shape

`-f` is a yargs array. Without `--`, the prompt is consumed as another filename (`Error: File not found: Continue the work.`). The `--` before the message is required:

```bash
opencode run -f <handoff> -- "Continue the work."
```

Do not omit `--`. Do not pass a Pi summary, extra files, or a longer prompt.

### Isolation (production OpenCode DB is not the store)

Redirect XDG so this session does not land in `~/.local/share/opencode/opencode.db`. Copy `auth.json` into the isolated data dir **without printing it**.

```bash
export XDG_DATA_HOME=/tmp/harnie-sprint-012-xdg/data
export XDG_CONFIG_HOME=/tmp/harnie-sprint-012-xdg/config
export XDG_STATE_HOME=/tmp/harnie-sprint-012-xdg/state
export XDG_CACHE_HOME=/tmp/harnie-sprint-012-xdg/cache

mkdir -p "$XDG_DATA_HOME/opencode"
cp ~/.local/share/opencode/auth.json "$XDG_DATA_HOME/opencode/auth.json"
chmod 0600 "$XDG_DATA_HOME/opencode/auth.json"
```

Confirm production `~/.local/share/opencode/opencode.db` mtime is unchanged after the run. Record the isolated DB path. Do not cat or log `auth.json`.

Recommended full invocation (same prompt shape; isolation flags added):

```bash
opencode run --pure --dir "$WORKSPACE" --format default \
  --title "harnie-sprint-012-real-repo" \
  -f "$HANDOFF" \
  -- \
  "Continue the work."
```

Capture stdout/stderr to `docs/research/sprint-012/opencode-run-stdout.txt` and `opencode-run-stderr.txt` when the run happens. Capture run notes (workspace, XDG, mtimes, argv, model, exit) in `run-notes.md`. None of those artifacts are invented here.

### `--auto`

- **Allowed** only if `$WORKSPACE` is a **dedicated eval clone** (throwaway copy of the real project). Sprint 011 used `--auto` because `/tmp/harnie-sprint-011-c` was disposable.
- **Do not** pass `--auto` when running in the operator’s **real** project unless the run notes **explicitly justify** it (what was auto-approved, why a clone was not used, and that the operator accepted writes/shell in that tree).
- Default for a live project: omit `--auto` and record whether the run hung on permissions.

---

## Ground truth (fill after session chosen)

Fill from the chosen Pi session, `harnie show`, and the workspace **before** (or independently of) scoring OpenCode. Leave cells blank until discovery. Do not backfill from OpenCode’s transcript.

Source session:  
Work id:  
Repo / workspace:  
Eval clone? (yes/no; path):  
Handoff file:  
Pi prefix stopped after:

| Fact | Value |
|---|---|
| Goal | |
| Files | |
| Decision | |
| Completed work (already executed) | |
| Predicate / patch / other already-on-disk result | |
| Failed approaches | |
| Unresolved | |
| Current repository state (branch / revision / dirty) | |
| Correct next work | |
| Wrong next work | |

Pi already:

1. *(tool / edit / read — fill from the session)*
2. *(…)*

The captured prefix stops there. Whatever is listed under **Unresolved** / **Correct next work** is the continuation target. **Wrong next work** is typically re-applying already-executed edits as if they were never done, or a different task the prefix does not have.

If a fact is unknown after reading the session (e.g. no failed approaches), write that explicitly (`None`, `Not in prefix`). Do not guess.

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

Primary artifact: `docs/research/sprint-012/opencode-run-stdout.txt`.  
Also usable if captured: `opencode-run-stderr.txt`, OpenCode session log (isolated XDG only), tool-call dump, workspace `git diff` / file mtimes after the run.

Treat these as **writes** (implementation): `edit`, `write`, `apply_patch`, `str_replace`, or a shell redirect that changes source files.

Treat these as **reads** (inspection): `read`, `cat`, `sed -n`, editor open without save.

Treat these as **search** (investigation): `rg`, `grep`, `find`, `glob`, `ls` used to *locate* work the handoff already named.

After ground truth is filled, name the concrete paths that count as the session’s source files vs verification-only files in the applied score. Do not pre-fill them here.

---

## Identify questions

Score only after the ground-truth table is filled **and** a live transcript exists. Until then, leave these unscored.

### 1. Original goal

**Ground truth:** *(Goal row.)*

| Score | Evidence |
|---|---|
| **identified** | States that goal, or verifies/edits only in service of it. |
| **missed** | Never names the goal and the work cannot be read as that task. |
| **contradicted** | Pursues a different task as the work to continue. |

### 2. Completed work

**Ground truth:** *(Completed work row — already executed in the Pi prefix / already on disk.)*

| Score | Evidence |
|---|---|
| **identified** | Says those steps already landed, or reads the named files / `git diff` and treats the completed work as present. Does not queue the same patches as todo. |
| **missed** | Never acknowledges prior work; unclear whether it thinks implementation is open. |
| **contradicted** | States or implies the completed work is still undone, or that the same patches still need to be applied. Re-edit of the same change is sufficient evidence. |

### 3. Important files

**Ground truth:** *(Files row — full paths.)*

| Score | Evidence |
|---|---|
| **identified** | Names or opens **all** ground-truth paths (read, grep *in those files*, test targeting them, or explicit list). |
| **missed** | Uses only a subset and never the rest, or never names any of them. |
| **contradicted** | Names the wrong files as the work site and works there instead. |

Opening extra test/config files in order to *run tests* or perform the ground-truth next work does not contradict, if the named source files are still treated as the work site.

### 4. Decisions already made

**Ground truth:** *(Decision row. Note whether that decision is already executed.)*

| Score | Evidence |
|---|---|
| **identified** | Restates or follows that approach. If it is already executed, treats it as chosen and done, then continues at the unresolved problem. |
| **missed** | Never refers to the decision; next actions are unrelated or unexplained. |
| **contradicted** | Chooses a different design, reverts the decided approach, or (if already executed) speaks of it as still ahead. |

Future-tense “I will …” is **contradicted** if it means already-applied work is still ahead. It is **identified** only if clearly restating the *already-applied* approach, or if ground truth says that work is genuinely still open.

### 5. Failed approaches

**Ground truth:** *(Failed approaches row.)*

| Score | Evidence |
|---|---|
| **identified** | Does not invent a failure. Avoids repeating named failures. If ground truth is none, silence is allowed; prefer **identified** if it simply does not fabricate failures. |
| **missed** | No signal either way, *and* it re-runs discovery as if prior search failed. If it is silent but goes straight to the named files, score **identified**. |
| **contradicted** | Claims a prior approach failed when it did not, treats a successful Pi step as an error, or repeats a documented failed approach as if new. |

This item is **not** a PASS/FAIL input unless OpenCode’s invented or repeated failure drives a wrong implementation. Record it either way.

### 6. Current repository state

**Ground truth:** *(Current repository state row — what is actually on disk in the eval workspace at run start.)*

The handoff may have no branch/revision. OpenCode must learn state from the workspace.

| Score | Evidence |
|---|---|
| **identified** | `git status` / `git diff` / file reads match ground truth, and OpenCode treats that as current. Naming a branch/SHA is extra, not required. |
| **missed** | Never inspects git or file contents; proceeds without a view of the tree. |
| **contradicted** | Claims a clean tree when dirty (or the reverse), or that completed edits are absent when they are on disk, or the opposite of the filled state row. |

### 7. Unresolved problem

**Ground truth:** *(Unresolved row.)*

| Score | Evidence |
|---|---|
| **identified** | Names that unresolved problem, or starts the work that addresses it (tests, confirmatory reads, the next implementation step the prefix actually left open). |
| **missed** | No mention of remaining work; stops, commits, or wanders without that problem. |
| **contradicted** | Treats the unresolved problem as re-doing completed work, or any new product gap the prefix does not have. |

Parser noise, diagnostics, or Harnie-internal messages in the handoff are not the unresolved problem unless ground truth says they are. Treating them as the bug is **contradicted**.

### 8. Appropriate next step

**Ground truth:** *(Correct next work row. Do not assume “verify” unless that is what the filled table says.)*

| Score | Evidence |
|---|---|
| **identified** | Next tool calls or the plan are that next work, or it reports that remaining work correctly and stops. |
| **missed** | No next step; idle or generic “continue later” without the ground-truth next work. |
| **contradicted** | Next step is the **Wrong next work** row (typically re-implementing already-done edits) or a different feature. |

---

## Behavior questions

### B1. Unnecessarily repeat investigation?

**Yes when:** it re-discovers the work site instead of using the handoff.

Evidence of **unnecessary** investigation (after files are filled):

- `rg` / `grep` / `find` across the repo to *locate* files the handoff already named
- listing trees or reading unrelated sources to find the work
- re-reading files **other than** the named paths (and test/harness files needed for the correct next work)

Evidence that is **not** unnecessary investigation:

- reading the ground-truth paths because the handoff named them
- `rg` **in those files** to confirm an already-reported patch
- running tests or doing the filled **Correct next work**

**no** = goes to the named files (or the correct next work) without a from-scratch search.  
**mixed** = confirmatory reads *plus* a discovery `rg`.

A discovery `rg` alone is not FAIL. Re-doing completed work is.

### B2. Contradict previous decisions?

**Yes when:** it abandons the filled **Decision**, or re-opens an already-executed decision as unimplemented.

Evidence: edits to other files as the work site; only a subset of a multi-site decision; revert of completed work; a new mechanism; statements that a different approach is needed.

**no** = keeps the decided approach, including “already applied” when that is ground truth.

### B3. Inspect irrelevant files?

**Relevant:** ground-truth files; tests for them; runner config needed to verify or to perform the correct next work.

**Irrelevant:** files with no role in the filled goal/files/next work (README unless the session is about it, other packages, `.git/config`, agent configs, Harnie internals).

**yes** = opens those without a verification / next-work reason.  
**no** = stays on the named files and next-work tooling.  
**mixed** = one stray read, then back on path.

### B4. Misunderstand current state?

**Yes when:** it treats **completed** work as **not done**, or otherwise asserts the opposite of the filled state row.

Evidence:

- “I will …” as a plan to execute work that already landed
- `edit`/`write` whose old text is the pre-completion source
- “Successfully replaced…” on the same patches
- stating files still need a change after a read that already showed it done

**no** = treats completed work as present; pursues or reports the unresolved problem.

This is the behavioral twin of identify Q2/Q6/Q7. If B4 is **yes**, overall cannot be PASS.

### B5. Make a correct next change?

**Correct:** the filled **Correct next work**. No file mutation is required if that next work is verification and the files already match ground truth.

Evidence of **yes**:

- tool calls that implement or verify that next work
- read/grep/`git diff` that confirm already-on-disk completed work, then stop or name the remaining work correctly
- tests aimed at that remaining problem, without re-patching completed edits

Evidence of **no**:

- re-apply already-executed patches
- write a different implementation of completed work
- skip the correct next work and also fail to name it as remaining
- drive-by refactors or a different task

Re-read of the named files in order to confirm completed work **is** a correct next change when the unresolved problem is verification. Re-write of those files **is not**, unless ground truth says those edits are still open.

---

## Overall pass/fail

Apply **after** the per-question scores. Use only the transcript. Substitute the filled ground-truth rows for Fixture C’s “5.3 edits / verification”.

| Overall | When |
|---|---|
| **PASS** | OpenCode treats **completed** work as **done**, **and** either attempts the filled **Correct next work** **or** reports that remaining work correctly. |
| **FAIL** | OpenCode re-implements already-executed work as if it were never done (the filled **Wrong next work**, typically re-applying the same patches). |
| **INCOMPLETE** | No continuation transcript (`opencode-run-stdout.txt` missing, empty, or not an OpenCode run), **or** no session has been chosen / ground truth is still blank. |
| **NOT PASS** | Transcript exists; it does **not** re-implement completed work; it also does **not** do or name the correct next work. |

Rules:

1. **FAIL wins over PASS.** Any re-implementation of already-executed work is FAIL, even if it later runs tests or eventually does the right next step.
2. **INCOMPLETE** if there is nothing to score. Do not infer behavior from the handoff markdown, from Sprint 011, or from a provider error with no tools.
3. A confirmatory read of the named files that already contain the completed work counts as attempting verification **when verification is the correct next work**.
4. Writing tests without re-editing completed sources counts as attempting verification **when that is the correct next work**.
5. Commit-only, drive-by refactors, or “done” with no check of the unresolved problem is **NOT PASS**, not PASS.
6. Extra investigation (B1 **yes**/**mixed**) does not by itself FAIL. It answers the sprint question (does the Fixture C PASS still hold — substantially less re-investigation?) separately; record it, do not stretch FAIL.
7. If B4 is **yes**, overall cannot be PASS (it is FAIL if that misunderstanding became a re-implementation; otherwise NOT PASS).

### Re-implementation (FAIL) — how to instantiate after discovery

After filling ground truth, list the concrete tells in the applied score (paths, old→new strings, tools). Generic tells:

- `edit`/`str_replace`/`write` whose purpose is to introduce already-on-disk completed work as new
- tool result “Successfully replaced text in …” for that same change
- assistant text that it is now applying a patch the Pi prefix already applied

Not FAIL:

- a no-op edit that does not change already-correct text (still **NOT PASS** if it never does the correct next work)
- editing a **new test file** that asserts the completed behavior, when tests are the next work
- formatting-only change with completed work already present (note it; still not re-implementation)
- implementing work the prefix **actually left open**

---

## How to apply (when a transcript exists)

1. Confirm a real unfinished Pi session was chosen and the ground-truth table is filled from that session + workspace, not from OpenCode.
2. Confirm the artifact is a real `opencode run` continuation (`-f` handoff, `--`, prompt only `Continue the work.`), not a probe or a handoff reprint. Confirm isolated XDG and the `--auto` rule above.
3. List tool calls in order (name, path/command, write vs read).
4. Score Q1–Q8, then B1–B5, with a one-line evidence cite each (quote or tool line).
5. Apply the overall rule. Do not average the eight identify scores into PASS.
6. Note whether re-investigation was substantially less than a fresh session would need (sprint question: does the Fixture C PASS still hold on a real repo). That note is not the PASS/FAIL gate.

Do not score Fixture C or Trace B with this file. Those stay on the Sprint 011 rubric / package scores.

---

## Live score

Evidence cutoff: 2026-09-02.

**Overall: INCOMPLETE.** No continuation behavior to score.

No real Pi session has been chosen. The ground-truth table above is blank by design.

`docs/research/sprint-012/opencode-run-stdout.txt` does not exist. There is no OpenCode continuation transcript: no assistant text, no tool calls, no file writes. None is invented here.

Q1–Q8 and B1–B5 are **unscored**. Do not infer PASS/FAIL from a Harnie handoff, from Sprint 011’s Fixture C PASS, or from a run that has not happened.

Re-apply this rubric when (1) a session is chosen and the ground-truth table is filled, and (2) a non-empty `opencode-run-stdout.txt` from `opencode run -f <handoff> -- "Continue the work."` exists.
