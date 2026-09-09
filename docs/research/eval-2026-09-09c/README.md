# Candidate-bound probe pass — 2026-09-09 (Order 5, final pass for `v0.1.0-rc.5`)

This is the third independent attempt to fund the still-missing pi-receiver legs
of the Order 5 matrix, this time bound to the exact candidate tag
**`v0.1.0-rc.5` → `6ac02e359b3b973c7fc4b4c603a6d2db38b665dc`** (HEAD =
tagged commit at pass time; Node v22.23.0, darwin). The re-audit P1 left
verdict B PARTIAL with four not-run legs; this pass probed the pi provider
first and, on probe failure, recorded the legs not-run without spending any
receiver invocation. Protocol:
[docs/internal/EVALUATION-PROTOCOL.md](../../internal/EVALUATION-PROTOCOL.md)
(§4 two-verdict rules). Prior passes:
[`eval-2026-09-09/`](../eval-2026-09-09/README.md) (rc.2),
[`eval-2026-09-09b/`](../eval-2026-09-09b/README.md) (rc.3).

Executed 2026-09-09T13:52Z–13:59Z by an agent. Every claim below is backed by
a file in this directory.

## Probe outcome (step 1 — provider funding)

Two cheap `pi -p` probes, one per candidate model, minimal prompt, no receiver
run attempted beforehand:

| Probe (UTC 13:54Z) | Result | Evidence |
| --- | --- | --- |
| pi / `openrouter/moonshotai/kimi-k2.5` (paid) | **402 `openrouter_credits`** — "You requested up to 4096 tokens, but can only afford 2422" (identical shortfall to the 2026-09-09 probes; credits do not reset) | `probes/pi-kimi-k2.5-probe.{out,err}` (stdout empty, exit 1) |
| pi / `openrouter/cohere/north-mini-code:free` (free tier) | **429 `openrouter_free_tier_daily`** — `X-RateLimit-Remaining: 0`, `X-RateLimit-Reset: 1788998400000` = 2026-09-10T00:00:00Z (account-wide 50/day key, contested; ~10h to reset at probe time) | `probes/pi-free-probe.{out,err}` (stdout empty, exit 1) |

Conclusion: **the pi receiver is still provider-unfunded** (unchanged since the
two prior probe passes). Per the pass rule ("probe still fails → do NOT burn
budget retrying"), no pi-targeted receiver invocation was made and no retry
loop was run.

Live invocations this pass: **2 of the ≤12 budget** (the two probes). No
invocation hit the 10-minute kill timeout (probes exit immediately). No
`harnie` command was invoked at all in this pass (the handoff artifacts are
pre-existing and sha-pinned; nothing needed rendering), so no Harnie home —
temp or otherwise — was exercised; `~/.harnie` was never touched.

## Per-leg table (all bound to the candidate)

| Leg (source→target) | Task | Condition | tagSha (refName) | Status | Evidence / reason |
| --- | --- | --- | --- | --- | --- |
| OpenCode→Pi | version-flag | handoff (trials 2–3 of the ≥3-trial target) | `6ac02e359b3b` (`v0.1.0-rc.5`) | **NOT RUN — provider unfunded** | `runs/eval-20260909T1354-pi-blocked/version-flag/handoff/` — probe evidence in `notRunReason`; ready artifact `handoff-opencode_pi-version-flag.md` (1736 chars, sha256 `1fc50145d413…`) re-verified unchanged |
| OpenCode→Pi | version-flag | baseline | `6ac02e359b3b` (`v0.1.0-rc.5`) | **NOT RUN — provider unfunded** | `runs/eval-20260909T1354-pi-blocked/version-flag/baseline/` — still no successful pi baseline anywhere (rc.2 trial-1 handoff PASS remains unpaired) |
| Codex→Pi | shebang-guard | handoff | `6ac02e359b3b` (`v0.1.0-rc.5`) | **NOT RUN — provider unfunded** | `runs/eval-20260909T1354-pi-blocked/shebang-guard/handoff/` — ready artifact `handoff-codex_pi-sprint024.md` (3225 chars, sha256 `da0b1468e96b…`) re-verified unchanged |
| Codex→Pi | shebang-guard | baseline | `6ac02e359b3b` (`v0.1.0-rc.5`) | **NOT RUN — provider unfunded** | `runs/eval-20260909T1354-pi-blocked/shebang-guard/baseline/` |

Every record is schema `harnie-eval-result/v2`, `status: "not-run"`, with the
probe-based `notRunReason`; the harness `record` command validated all four
(strict v2 invariants, condition/provenance agreement). No result in this
directory has `status: "ran"` — the candidate has **zero** candidate-bound
receiver runs; all successful receiver evidence to date remains rc.2/rc.3-bound
(recorded in the two prior dirs).

## Developer re-explanation proxy comparison (from existing logs; nothing new executed)

Proxy = wall time + receiver command/investigation counts
(`commandsRun` in each `result.json`; investigation quality only has the
harness's `repeatedInvestigation` field). All four comparable handoff-vs-baseline
pairs on record, quoted from the run records:

| Pair (task, tag) | Handoff | Baseline | Δ (handoff−baseline) | Commands (h / b) |
| --- | --- | --- | --- | --- |
| Pi→OpenCode, version-flag (rc.2) | 30.739s | 42.496s | **−11.8s** (handoff faster) | 3 / 3 |
| Codex→OpenCode, help-regression-test (rc.2) | 36.522s | 28.236s | +8.3s | 2 / 2 |
| OpenCode→Codex, greeting-command step-3 (rc.2) | 129.100s | 129.851s | −0.8s | 5 / 5 |
| Codex→OpenCode, first-run-recovery (rc.3, newest) | 35.107s | 33.271s | **+1.8s** (handoff slower) | 2 / 2 |
| OpenCode→Pi, version-flag (rc.2) | 368.408s (trial 1 PASS) | — never succeeded | not comparable | 0 / — |

Reading: mean Δ ≈ −0.6s with mixed sign (1 faster, 2 slower, 1 ≈ equal);
command counts are identical within every pair (the verification suite is
task-determined, not condition-determined); `repeatedInvestigation` is `none`
in **both** conditions of every successful run — there was no repeated
investigation for the handoff to eliminate.

**"Substantially less developer re-explanation" threshold (IMPLEMENTATION.md
§25): NOT ESTABLISHED.** The n=1 pairs show no measurable reduction in
re-explanation proxies (wall time indistinguishable, command counts equal, no
repeated investigation in either condition), and the newest pair is in the
wrong direction (35.1s vs 33.3s). The pass that could have strengthened or
refuted this on the pi receiver (OpenCode→Pi baseline + trials) is
provider-blocked. Harnie's "materially reduce context reconstruction" claim
remains unproven; the release notes make no productivity claim (consistent
with `docs/internal/RELEASE-0.1.0-rc.5.md`).

## Verdicts — two-verdict framing (per EVALUATION-PROTOCOL.md §4)

Verdict A and verdict B are separate claims; a PASS on A is not a PASS on B.

**Verdict A — safety behavior among completed runs: PASS (carried; unchanged
by this pass).** The completed-run set did not change (no receiver ran). All
9 successful receiver runs on record (7 in `eval-2026-09-09`, rc.2; 2 in
`eval-2026-09-09b`, rc.3) show zero false completions, zero repeated finished
edits, and zero out-of-scope edits in successful runs. Note precisely: this is
evidence about completed runs on prior candidate tags — the candidate
`v0.1.0-rc.5` itself has no receiver runs (probe-gated pass; nothing new
failed, nothing new passed).

**Verdict B — full Order 5 matrix / protocol gate: PARTIAL (INCONCLUSIVE as a
gate).** Unchanged from the re-audit, now with a third independent probe pass
bound to the candidate:

- Met (on prior tags): Pi→OpenCode handoff+baseline; OpenCode→Pi handoff
  trial 1 (n=1, no paired baseline); Codex→OpenCode handoff+baseline
  (transport/receiver compatibility; rc.3 pair had task-matching driver
  context); OpenCode→Codex continuation-semantics leg (driver steps 1–2 →
  receiver step 3).
- Not met / not run (all provider-blocked, all recorded not-run in
  `runs/eval-20260909T1354-pi-blocked/`): OpenCode→Pi baseline; OpenCode→Pi
  trials 2–3; the entire Codex→Pi leg (handoff + baseline). Handoff artifacts
  are ready and sha-pinned; the legs execute unchanged once a funded pi model
  exists. Do not claim the matrix is met.

## Release waiver confirmation

`docs/internal/RELEASE-0.1.0-rc.5.md` (read-only for this pass) waives the
full continuation-matrix gate (Verdict B) for this developer preview on
exactly these grounds: OpenCode→Pi baseline/trials and Codex→Pi not-run
pending a funded pi provider (402 credits / contested 429 free tier), Verdict
A PASS required and held, no productivity claim. **The waiver remains
accurate** — this pass re-verified the funding state (both probes failed the
same way as 2026-09-09) and changed no completed-run facts.

## Raw evidence map

- `probes/` — the two availability probes (stdout + stderr preserved verbatim,
  exit codes recorded above).
- `runs/eval-20260909T1354-pi-blocked/` — `run.json` (`refName:
  "v0.1.0-rc.5"`, `tagSha 6ac02e3…`), four `status: "not-run"` result records
  (strict v2, registered via harness `record`), harness
  `summary.{md,json}`.
- `driver/` artifacts referenced by the handoff-condition records resolve
  relatively into [`eval-2026-09-09/driver/`](../eval-2026-09-09/driver/)
  (`../../../../../eval-2026-09-09/driver/handoff-*.md`); both sha256s were
  re-verified at 13:57Z today and are re-checked by `verify-evidence`.

Integrity: `node scripts/eval-continuation.mjs verify-evidence --dir
docs/research/eval-2026-09-09c` → OK (1 run dir, 4 result records); the same
check passes on `eval-2026-09-09` (10 run dirs, 17 records) and
`eval-2026-09-09b` (2 run dirs, 6 records).

## Limitations

- Zero receiver runs this pass; existence of a blocker documented, not a
  behavior measurement.
- The pi-receiver legs of the matrix remain open solely due to provider
  funding (402 credits do not reset; free tier resets 2026-09-10T00:00Z but
  the key is account-wide and contested — exhausted within ~90 minutes of the
  last reset).
- Re-explanation threshold assessment rests on n=1 pairs (mixed, near-zero
  mean delta) — see the comparison section above.
