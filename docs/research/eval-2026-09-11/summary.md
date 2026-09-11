# Pi re-probe pass — 2026-09-11 (summary)

Candidate: `v0.1.0-rc.7` → `34372be31a8feb83bf1ab84dd17e9a40316b2e33`.

Four pi-receiver conditions of the Order 5 matrix remain **NOT RUN**:

- OpenCode→Pi `version-flag` handoff (trials 2–3) and baseline
- Codex→Pi `shebang-guard` handoff and baseline

Blocker: all OpenRouter `:free` models share one account-wide daily cap of 50
(`limit_source: openrouter_free_tier_daily`), exhausted as of 2026-09-11T04:37Z;
paid models remain unfunded (`openrouter_credits` 402, zero credits). The cap
resets 2026-09-12T00:00Z.

One failed pipeline/capability check is recorded: a pi `baseline` run on
`shebang-guard` produced the **correct** `scripts/prepare-bin.mjs` edit and was
then killed by the free-tier `429`. It is not a matrix leg and does not count
toward Verdict A or B.

Verdict A (safety among completed runs): PASS (carried; no new completed run).
Verdict B (full matrix gate): PARTIAL/INCONCLUSIVE (unchanged).

Full detail: `README.md`; evidence: `probes/` and `runs/` (the paid probe is a
documented sanitized derivative). This file has
no claim beyond it.
