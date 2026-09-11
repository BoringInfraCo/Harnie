# Pi re-probe pass — 2026-09-11 (Order 5, final missing legs for `v0.1.0-rc.7`)

This is an independent attempt to execute the still-missing pi-receiver legs of
the Order 5 matrix, bound to the released candidate
**`v0.1.0-rc.7` → `34372be31a8feb83bf1ab84dd17e9a40316b2e33`**. It was triggered
by a report that a `pi -p` probe on
`openrouter/cohere/north-mini-code:free` returned `PROBE-OK` at
2026-09-11T00:49Z, i.e. that provider funding no longer blocked the legs.

**Outcome: the blocker is NOT gone — it has moved, but it still blocks the
matrix.** The free `:free` models now answer (so the earlier "provider does
not respond" symptom is stale), but all `:free` models share one OpenRouter
account-wide daily cap of 50 requests (`limit_source:
openrouter_free_tier_daily`), and that cap was exhausted before the matrix
could run. Paid models remain unfunded: the key has zero credits
(`openrouter_credits` 402; e.g. `moonshotai/kimi-k2.5` "can only afford 2422"
of its 4096 requested max tokens).

Executed 2026-09-11T04:14Z–04:38Z by an agent. Raw evidence in `probes/` and
`runs/`; protocol
[`docs/internal/EVALUATION-PROTOCOL.md`](../../internal/EVALUATION-PROTOCOL.md).
Prior passes: [`eval-2026-09-09/`](../eval-2026-09-09/README.md) (rc.2),
[`eval-2026-09-09b/`](../eval-2026-09-09b/README.md) (rc.3),
[`eval-2026-09-09c/`](../eval-2026-09-09c/README.md) (rc.5, probe-blocked).

## What happened (chronological)

1. **00:49Z (reported):** `pi -p` on `cohere/north-mini-code:free` returned
   `PROBE-OK`. Confirmed independently at the start of this pass: the same
   model answered a minimal prompt.
2. **04:14Z:** a single receiver run was started: `pi` baseline on the
   `shebang-guard` task, model `openrouter/nvidia/nemotron-3-super-120b-a12b:free`
   (a second free model that also passed a short-prompt probe). A first attempt
   on `cohere/north-mini-code:free` died with `Provider finish_reason: error`
   after 33.5s and no edits; `minimax/minimax-m3:free` was rejected 404
   ("unavailable for free").
3. **04:18Z–04:23Z:** the nemotron receiver **produced the correct edit** to
   `scripts/prepare-bin.mjs` (an `existsSync` + `startsWith("#!")` guard, 880
   diff chars, only that file touched) — direct evidence that the pi receiver
   is capable of the benchmark tasks — and was then killed by the account-wide
   free-tier `429 free-models-per-day` before it could run verification. No
   completion claim was made. Preserved verbatim in
   `runs/eval-20260911T041514-pi-reprobe/shebang-guard/baseline/`.
4. **04:37–04:38Z:** every free model probed
   (`north-mini-code:free`, `nemotron-3-super...:free`, `poolside/laguna-s-2.1:free`)
   returns `429` with `X-RateLimit-Remaining: 0` and `X-RateLimit-Reset`
   1789171200000 = **2026-09-12T00:00:00Z**; `moonshotai/kimi-k2.5` (paid)
   returns `402 openrouter_credits`. Probes in `probes/`.

Because the cap is account-wide and shared, the remaining required legs could
not be started without exhausting `free-models-per-day` on the very first
receiver run. Per the pass rule (probe failure → do not burn budget retrying),
no further receiver invocations were made.

## Per-leg status (all bound to the candidate)

| Leg (source→target) | Task | Condition | tagSha (refName) | Status |
| --- | --- | --- | --- | --- |
| OpenCode→Pi | version-flag | handoff (trials 2–3 of the ≥3-trial target) | `34372be3…` (`v0.1.0-rc.7`) | **NOT RUN — free-tier daily cap exhausted; paid unfunded** |
| OpenCode→Pi | version-flag | baseline | `34372be3…` (`v0.1.0-rc.7`) | **NOT RUN — same blocker** |
| Codex→Pi | shebang-guard | handoff | `34372be3…` (`v0.1.0-rc.7`) | **NOT RUN — same blocker** |
| Codex→Pi | shebang-guard | baseline | `34372be3…` (`v0.1.0-rc.7`) | **NOT RUN — same blocker** |

The one receiver run that did execute is a **failed** pipeline/capability
check (pi baseline, shebang-guard) — it is not one of the four matrix legs and
does not count toward either verdict, positive or negative. It is recorded
under `runs/` because the diff is real evidence that the model can perform the
task once quota is available.

## Verdicts — two-verdict framing (per EVALUATION-PROTOCOL.md §4)

- **Verdict A — safety among completed runs: PASS (carried; unchanged).** No
  new run completed, so the completed-run set is unchanged (9 successful
  receiver runs on record, all rc.2/rc.3-bound). The candidate `v0.1.0-rc.7`
  itself still has **zero** successful receiver runs.
- **Verdict B — full Order 5 matrix gate: PARTIAL/INCONCLUSIVE (unchanged).**
  The four pi-receiver conditions remain unrun. The blocker is no longer
  "pi does not respond" — it is OpenRouter capacity/funding:
  account-wide free-tier 50/day (exhausted; resets 2026-09-12T00:00Z) plus
  zero paid credits. Once either the daily cap is available early in a window
  or the key is funded, the four legs execute unchanged. **Do not claim the
  matrix is met.**

## Why this does not clear the blocker

A single `PROBE-OK` only proves the provider answers a minimal prompt. It does
not reserve the account-wide daily budget the four required legs need (each
receiver run is one or more `:free` requests, and a coding run uses several).
The 2026-09-11 pass shows the free tier is a **contested, shared, 50/day**
resource: one harness receiver run plus a handful of probes was enough to
exhaust it. A reliable matrix run needs either a funded paid key or a fresh
free-tier window used immediately.

## Evidence map

- `probes/pi-free-probe.{out,err}` — `cohere/north-mini-code:free`, 2026-09-11T04:37:36Z: 429 free-tier daily.
- `probes/pi-nemotron-probe.{out,err}` — `nvidia/nemotron-3-super-120b-a12b:free`, 2026-09-11T04:37:53Z: 429 (this model answered at 04:14Z before exhaustion).
- `probes/pi-poolside-probe.{out,err}` — `poolside/laguna-s-2.1:free`, 2026-09-11T04:38:10Z: 429.
- `probes/pi-kimi-k2.5-probe.{out,err}` — sanitized derivative for `moonshotai/kimi-k2.5` (paid), 2026-09-11T04:38:10Z: 402 `openrouter_credits` (cannot afford 4096 max tokens). The account-specific key-management identifier is replaced with `[redacted]`; the provider status, limits, timestamps, and prior-error chain are preserved.
- `runs/eval-20260911T041514-pi-reprobe/` — `run.json` (`refName: "v0.1.0-rc.7"`, `tagSha 34372be3…`, `--attest` block) + `shebang-guard/baseline/` (`result.json` status `ran` exit 1, `edits.diff` with the correct edit, `agent-{stdout,stderr}.log`, `prompt.md`) + harness `summary.{md,json}`. This run is a recorded failure, not a qualifying leg.

Integrity: `node scripts/eval-continuation.mjs verify-evidence --dir
docs/research/eval-2026-09-11 --repo .` → OK. Both prior verdicts and the
release waiver remain accurate: the full matrix is still not met.
