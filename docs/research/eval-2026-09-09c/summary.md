# Summary — eval-2026-09-09c (candidate-bound probe pass, 2026-09-09)

Candidate: tag **`v0.1.0-rc.5`** → `6ac02e359b3b973c7fc4b4c603a6d2db38b665dc` · Node v22.23.0 · darwin.
Purpose: final Order 5 attempt to run the re-audit's four missing pi-receiver legs against the exact candidate. Probe-first rule applied: provider still unfunded → legs recorded not-run, no receiver invocation spent (2 of ≤12 live invocations used, both probes).

## Probe outcome (2026-09-09T13:54Z, `probes/`)

| Probe | Result |
| --- | --- |
| pi / `openrouter/moonshotai/kimi-k2.5` | **402 `openrouter_credits`** — 4096 max_tokens requested, 2422 affordable; credits do not reset (`probes/pi-kimi-k2.5-probe.{out,err}`) |
| pi / `openrouter/cohere/north-mini-code:free` | **429 `openrouter_free_tier_daily`** — X-RateLimit-Remaining 0; resets 2026-09-10T00:00Z; account-wide contested key (`probes/pi-free-probe.{out,err}`) |

### Re-probe (post-rc.5 re-audit P2 status check, 2026-09-09T15:35Z)

Both models re-probed and **still blocked** — appended (not overwritten) to
the same probe files with live-clock separators: kimi-k2.5 **402
`openrouter_credits`** (identical 2422/4096 shortfall), free tier **429**
(`X-RateLimit-Remaining: 0`, reset 2026-09-10T00:00Z). **Orchestrator status:
still BLOCKED — do not sequence full candidate-bound pi legs.** The four
not-run records carry this outcome in their `notes`; no receiver legs were
run in the re-probe.

## Per-leg results (run `eval-20260909T1354-pi-blocked`)

| Leg (source→target) | Task | Condition | tagSha | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| OpenCode→Pi | version-flag | handoff (trials 2–3) | `6ac02e359b3b` (v0.1.0-rc.5) | NOT RUN — provider unfunded | not-run record + probe evidence; ready artifact sha `1fc50145d413…` re-verified |
| OpenCode→Pi | version-flag | baseline | `6ac02e359b3b` (v0.1.0-rc.5) | NOT RUN — provider unfunded | not-run record + probe evidence |
| Codex→Pi | shebang-guard | handoff | `6ac02e359b3b` (v0.1.0-rc.5) | NOT RUN — provider unfunded | not-run record; ready artifact sha `da0b1468e96b…` re-verified |
| Codex→Pi | shebang-guard | baseline | `6ac02e359b3b` (v0.1.0-rc.5) | NOT RUN — provider unfunded | not-run record + probe evidence |

All four records: `harnie-eval-result/v2`, `status: "not-run"` with probe-based `notRunReason`, validated by harness `record` (strict v2). The candidate has zero candidate-bound receiver runs; all successful receiver evidence remains rc.2/rc.3-bound (see `eval-2026-09-09`, `eval-2026-09-09b`).

## Developer re-explanation proxy (from existing run records)

| Pair (task, tag) | Handoff wall | Baseline wall | Δ | Commands h/b |
| --- | --- | --- | --- | --- |
| Pi→OpenCode version-flag (rc.2) | 30.739s | 42.496s | −11.8s | 3/3 |
| Codex→OpenCode help-regression-test (rc.2) | 36.522s | 28.236s | +8.3s | 2/2 |
| OpenCode→Codex greeting-command (rc.2) | 129.100s | 129.851s | −0.8s | 5/5 |
| Codex→OpenCode first-run-recovery (rc.3) | 35.107s | 33.271s | +1.8s | 2/2 |
| OpenCode→Pi version-flag (rc.2) | 368.408s | — (never succeeded) | n/a | 0/— |

Mean Δ ≈ −0.6s, mixed sign; command counts identical within every pair; `repeatedInvestigation: none` in both conditions of all successful runs.

**Threshold verdict: "substantially less developer re-explanation" (IMPLEMENTATION.md §25) — NOT ESTABLISHED.** No measurable re-explanation reduction in any proxy; newest pair in the wrong direction (35.1s vs 33.3s); the pi-receiver pass that could have added evidence is provider-blocked. No productivity claim is made.

## Verdicts

- **Verdict A — safety among completed runs: PASS (carried, unchanged).** 9 successful receiver runs across rc.2/rc.3: zero false completions, zero repeated finished edits, zero out-of-scope edits. The candidate itself has no receiver runs (probe-gated).
- **Verdict B — full Order 5 matrix gate: PARTIAL / INCONCLUSIVE.** OpenCode→Pi baseline + trials 2–3 and the whole Codex→Pi leg remain not-run (provider unfunded, third independent confirmation). Do not claim the matrix is met.

## Release waiver

`docs/internal/RELEASE-0.1.0-rc.5.md` waiver of Verdict B remains accurate as of this pass (blocker re-verified 2026-09-09T13:54Z; no completed-run facts changed).

## Integrity

`node scripts/eval-continuation.mjs verify-evidence --dir docs/research/eval-2026-09-09c` → OK (1 run dir, 4 result records) under the stricter post-rc.5 re-audit rules (exact candidate binding incl. git re-resolution of the `v0.1.0-rc.5` tag; committed summaries compared against harness regenerations); also OK on `eval-2026-09-09` (10/17) and `eval-2026-09-09b` (2/6). The handoff-condition records carry `handoffGeneratedByRef`/`handoffGeneratedBySha` (v0.1.0-rc.2 / `0231dd77…`) naming the rc.2-era runs that rendered the referenced artifacts; the per-run summary was regenerated via `--fix` after those edits. `tests/eval-harness.test.ts` + `tests/eval-docs-consistency.test.ts` 35/35 green.
