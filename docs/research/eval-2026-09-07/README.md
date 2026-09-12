# Continuation evaluation results — 2026-09-07 (Order 5)

Raw outcome evidence for the Order 5 re-run of the continuation evaluation on
the release candidate. Protocol: [docs/EVALUATION-PROTOCOL.md](../../EVALUATION-PROTOCOL.md).
Executed 2026-09-07 by an agent (opencode-go/omen-alpha) following §6 of the
protocol. Every claim below is backed by a file in this directory; raw machine
evidence (clones, receiver session DBs) additionally lives in the disposable
run dirs named at the bottom.

## Environment

| Field | Value |
| --- | --- |
| Receiver agent | `opencode` 1.18.29 (`opencode run --auto "<prompt>"`), spawned by the harness in the task clone |
| Receiver model | `opencode-go/kimi-k2.7-code` (single receiver, single model, all 8 runs) |
| Node / platform | v22.23.0 / darwin (arm64) |
| Repo ref under evaluation | worktree snapshot `3cfc04502aa9db3f846f534441342f011a0781a1` (parent `dee5af7`) — the RC is uncommitted working-tree state, snapshotted by the harness via throwaway temp-index + `git commit-tree`; **noted per protocol §7**, since a committed RC ref was preferred but not available |
| Driver (handoff producer) | synthetic OpenCode sessions (`opencode-session-v1` snapshots, `driver/driver-*.json`) imported into a scratch `HARNIE_HOME` and rendered with `harnie handoff <work> --to opencode` |

Why synthetic driver sessions: the protocol permits committed fixtures or
synthetic sessions; no live prior-session driver agent runs were budgeted.
Each driver session investigates its task, states an explicit "I will …"
decision, and ends **before** making the edit — so the handoff genuinely
delegates the remaining work.

## What ran (8 valid receiver invocations, run `eval-20260907T2041`)

| Task | Condition | Exit | Wall | Tool calls (census) | Files edited | Out-of-scope | Verification | Handoff chars |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| version-flag | handoff | 0 | 44.8s | bash×4, edit×3, read×3 | src/cli.ts | none | pass | 1654 |
| version-flag | baseline | 0 | 67.9s | bash×6, read×7, edit×2, glob×1 | src/cli.ts | none | pass | (n/a) |
| shebang-guard | handoff | 0 | 42.1s | bash×4, edit×1, read×1 | scripts/prepare-bin.mjs | none | pass | 1686 |
| shebang-guard | baseline | 0 | 58.6s | bash×7, read×2, edit×1 | scripts/prepare-bin.mjs | none | pass | (n/a) |
| first-run-recovery | handoff | 0 | 21.2s | bash×2, edit×1, read×1 | docs/internal/FIRST-RUN.md | none | pass | 1697 |
| first-run-recovery | baseline | 0 | 38.8s | bash×1, edit×1, read×1 | docs/internal/FIRST-RUN.md | none | pass | (n/a) |
| help-regression-test | handoff | 0 | 49.9s | bash×4, read×2, write×1 | tests/regression-help.test.ts (new) | none | pass | 1637 |
| help-regression-test | baseline | 0 | 64.0s | bash×3, read×3, glob×2, write×1, todowrite×6 | tests/regression-help.test.ts (new) | none | pass | (n/a) |

- Every result was validated and registered with
  `node scripts/eval-continuation.mjs record` (`result.json` per condition,
  schema `harnie-eval-result/v1`).
- `verification.passed = true` is **not** the receiver's claim alone: after
  each run the evaluator independently re-ran the task's verification commands
  in the clone (all pass: `--version` prints 0.0.0/exit 0 + cli-init 7/7;
  guard exit-0/exit-1 paths + `test:package` green; `## Recovery` at line 495
  with only that file changed; regression test 1/1 + `typecheck` clean).

## Preview gate (initial) — per audit line 145

**PASS on all four benchmark tasks, both conditions: no false completion and
no repeated finished edits evidenced, with verification passing.**

| Task | falseCompletion | repeatedFinishedEdits | nextActionCorrect | missingOrFalseContext | taskCompleted |
| --- | --- | --- | --- | --- | --- |
| version-flag (both) | false | none | yes | none | true |
| shebang-guard (both) | false | none | yes | none | true |
| first-run-recovery (both) | false | none | yes | none | true |
| help-regression-test (both) | false | none | yes | none | true |

Evidence: each receiver made a **single** edit pass (edit/write census ≤ 3 per
run, all on the task's file), left the tree dirty without committing, and its
completion claim is corroborated by the recorded diff and the evaluator's
independent re-verification. No receiver edited a file outside its task scope.
Full per-condition metrics: `summary.json` / `runs/eval-20260907T2041/*/result.json`.

The summary's "unknowns still need human review" line refers to
`developerReExplanation` (judged `not-needed` here — no developer was in the
loop; the enum has no better value for a fully automated run).

## Handoff vs baseline (same task, same clone, only difference = the handoff)

- **Wall time**: handoff condition was faster on all four tasks
  (44.8s vs 67.9s; 42.1s vs 58.6s; 21.2s vs 38.8s; 49.9s vs 64.0s).
- **Investigation**: handoff-condition receivers read only the files the
  handoff named; baseline receivers explored more (version-flag: 7 reads +
  glob + dir listing vs 3 reads; help-regression: globs + 6 todo updates +
  one wrong-path read of nonexistent `src/cli.js` vs 2 reads).
- **Quality**: identical end state both conditions; diffs differ only in
  style (guard wording, section length 26 vs 16 inserted lines — both cover
  backup 0600, restore --force validation, and the no-undo caveat).
- Package sizes (chars): 1654 / 1686 / 1697 / 1637 — all under 2 KB with
  explicit truncation markers (e.g. `[+29 chars omitted]` with evidence refs)
  visible in `driver/*.md`.

## Failures and incidents recorded (not hidden)

1. **Containment failure in the first attempt (run `eval-20260907T2018`,
   invalid, excluded).** The harness passed `env: process.env` to the spawned
   receiver; `PWD` still pointed at the real repo while `cwd` was the clone,
   and `opencode run` resolves its project from `PWD`. All four receivers of
   that attempt escaped into the **real working tree** and edited
   `src/cli.ts`, `scripts/prepare-bin.mjs`, and `docs/internal/FIRST-RUN.md`
   there (proved by `git diff 1f8f80f` and receiver session directories =
   the repo). The repo was restored from the pre-eval worktree snapshot
   (`1f8f80f`) before re-running. Two harness bugs found and fixed:
   (a) `PWD`/`OLDPWD` not pinned to the clone (now pinned, plus outer-agent
   env markers `OPENCODE`/`OPENCODE_PID`/`AGENT` stripped); (b) `-m` not
   parsed by the harness (protocol examples used `-m`; now an alias for
   `--model`). Contaminated evidence:
   `runs/eval-20260907T2018-contaminated/` (results marked `not-run` with the
   reason in `notRunReason`).
2. **`codex` flag correction.** `codex exec --full-auto` does not exist in
   codex-cli 0.149.1; the harness now uses `codex exec --sandbox
   workspace-write` (protocol §5 updated). Codex and pi were **not used** as
   receivers in this evaluation.
3. **Model availability failure (run `eval-20260907T2039`).** The first
   re-run attempt targeted `anthropic/claude-sonnet-4-6`; both invocations
   failed in ~1.7s with `Your credit balance is too low to access the
   Anthropic API` (exit 1). Evidence:
   `runs/eval-20260907T2039-anthropic-credit-failure/`. All valid runs then
   used `opencode-go/kimi-k2.7-code`.
4. **Summary-table bug found during curation.** The harness `git()` helper
   trimmed `git status --porcelain` output, corrupting unstaged-modified
   entries (`rc/cli.ts`); fixed (no trim; explicit `.trim()` at rev-parse
   sites) and all results re-collected. `tests/eval-harness.test.ts`
   (6 tests) passes after all harness changes.

## Raw evidence map

- `summary.md` / `summary.json` — side-by-side + preview gate (from
  `node scripts/eval-continuation.mjs summarize --run eval-20260907T2041`).
- `runs/eval-20260907T2041/<task>/<condition>/` — `result.json` (registered),
  `prompt.md` (exact receiver prompt), `agent-stdout.log`,
  `agent-stderr.log`, `edits.diff`. Disposable originals (incl. clones):
  `/var/folders/.../T/opencode/harnie-eval/eval-20260907T2041/`.
- `runs/eval-20260907T2018-contaminated/` — invalid first attempt (containment
  failure), results marked `not-run` with reason.
- `runs/eval-20260907T2039-anthropic-credit-failure/` — the two failed
  invocations (stderr quoted above).
- `driver/` — synthetic driver sessions (`driver-*.json`) and the four
  rendered handoff packages (`work_opencode_ses_drv_*.md`) actually passed to
  the handoff condition via `--handoff`.
- Receiver session traces (tool-by-tool): opencode DB
  `~/.local/share/opencode/opencode.db`, session ids
  `ses_f818c463dffe…` (version-flag/handoff), `ses_f818b9566ffe…`,
  `ses_f818a7023ffe…`, `ses_f8189c9d0ffe…`, `ses_f8188d84cffe…`,
  `ses_f818883d7ffe…`, `ses_f8187dd04ffe…`, `ses_f8187189bffe…` (help-regression/baseline).

## Limitations

- **Sample size**: 4 tasks × 2 conditions = 8 receiver runs, one task each.
  No task was repeated; variance across runs of the same condition is
  unmeasured. This is an existence check, not a performance benchmark.
- **Single receiver + single model**: `opencode` with
  `opencode-go/kimi-k2.7-code` only. The audit asked for bidirectional paths
  (pi ↔ opencode ↔ codex); pi and codex receivers were **not exercised** —
  codex/pi flag support was only verified statically. Order 5's
  "bidirectional paths" gate is only partially covered.
- **Synthetic driver sessions**: the handoff condition used handoffs produced
  from synthetic opencode sessions, not from a real prior agent session on
  the RC. The handoff's value-add is therefore measured under idealized,
  accurate context; real sessions (messier, larger) may behave differently.
- **Small, fully-specified tasks**: each task is a single-file edit with
  explicit verification steps; no long-session, multi-execution, or
  ambiguous-goal continuation was tested.
- **Human-judged metrics** (`developerReExplanation`) had no developer in the
  loop; recorded `not-needed` rather than observed.
- **Receiver contamination risk is environment-dependent**: the PWD escape
  means any harness running agents from a different cwd must pin `PWD`;
  this is now handled and unit-covered only indirectly (the harness tests do
  not spawn a real agent).
- Wall-time differences (handoff faster in 4/4) come from a single paired
  sample each; treat as indicative, not significant.
