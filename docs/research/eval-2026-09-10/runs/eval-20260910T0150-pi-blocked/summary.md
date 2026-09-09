# Continuation evaluation summary — run eval-20260910T0150-pi-blocked

Ref: `v0.1.0-rc.3` → `cbe5399346a27d43a13dc8856dfe54ff039936fe` · tagSha `cbe5399346a27d43a13dc8856dfe54ff039936fe` · Node: v22.23.0 · Platform: darwin · Repo: Harnie

| Task | Condition | Source→Target | Status | Agent | Model | tagSha | Handoff sha256 (first 12) | Exit | Files edited | Out-of-scope | Verification | Repeated finished edits | False completion | Completed | Handoff chars |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| version-flag | handoff | opencode→pi | not-run | pi |  | cbe5399346a2 | 1fc50145d413 |  |  |  | unknown | unknown | unknown | unknown | 1736 |
| version-flag | baseline | opencode→pi | not-run | pi |  | cbe5399346a2 |  |  |  |  | unknown | unknown | unknown | unknown | N/A |
| shebang-guard | handoff | codex→pi | not-run | pi |  | cbe5399346a2 | da0b1468e96b |  |  |  | unknown | unknown | unknown | unknown | 3225 |
| shebang-guard | baseline | codex→pi | not-run | pi |  | cbe5399346a2 |  |  |  |  | unknown | unknown | unknown | unknown | N/A |
| first-run-recovery | handoff | | missing | | | | | | | | | | | | |
| first-run-recovery | baseline | | missing | | | | | | | | | | | | |
| help-regression-test | handoff | | missing | | | | | | | | | | | | |
| help-regression-test | baseline | | missing | | | | | | | | | | | | |
| greeting-command | handoff | | missing | | | | | | | | | | | | |
| greeting-command | baseline | | missing | | | | | | | | | | | | |

## Preview gate (initial)

- version-flag: FAIL — handoff: status=not-run (OpenCode->Pi extra trials (leg a, requested +2): NOT RUN - provider unfunded, verified by cheap probes 2026-09-10T01:3x-01:4xZ (probes/): pi/openrouter moonshotai/kimi-k2.5 -> 402 openrouter_credits (balance affords ~2.4K of the model's 4096 max_tokens); pi/openrouter cohere/north-mini-code:free -> 429 openrouter_free_tier_daily (X-RateLimit-Remaining: 0, account-wide 50/day key contested, resets next UTC midnight). Recorded not-run; no receiver invocation spent. Handoff artifact ready and unchanged from 2026-09-09 (sha256 verified).); baseline: status=not-run (OpenCode->Pi baseline (leg a): NOT RUN - provider unfunded, verified by cheap probes 2026-09-10T01:3x-01:4xZ (probes/): pi/openrouter moonshotai/kimi-k2.5 -> 402 openrouter_credits (balance affords ~2.4K of the model's 4096 max_tokens); pi/openrouter cohere/north-mini-code:free -> 429 openrouter_free_tier_daily (X-RateLimit-Remaining: 0, account-wide 50/day key contested, resets next UTC midnight). Recorded not-run; no receiver invocation spent.)
- shebang-guard: FAIL — handoff: status=not-run (Codex->Pi handoff (leg b): NOT RUN - provider unfunded, verified by cheap probes 2026-09-10T01:3x-01:4xZ (probes/): pi/openrouter moonshotai/kimi-k2.5 -> 402 openrouter_credits (balance affords ~2.4K of the model's 4096 max_tokens); pi/openrouter cohere/north-mini-code:free -> 429 openrouter_free_tier_daily (X-RateLimit-Remaining: 0, account-wide 50/day key contested, resets next UTC midnight). Recorded not-run; no receiver invocation spent. Handoff artifact handoff-codex_pi-sprint024.md ready and unchanged (sha256 verified).); baseline: status=not-run (Codex->Pi baseline (leg b): NOT RUN - provider unfunded, verified by cheap probes 2026-09-10T01:3x-01:4xZ (probes/): pi/openrouter moonshotai/kimi-k2.5 -> 402 openrouter_credits (balance affords ~2.4K of the model's 4096 max_tokens); pi/openrouter cohere/north-mini-code:free -> 429 openrouter_free_tier_daily (X-RateLimit-Remaining: 0, account-wide 50/day key contested, resets next UTC midnight). Recorded not-run; no receiver invocation spent.)
- first-run-recovery: NOT RUN — no results recorded for this task
- help-regression-test: NOT RUN — no results recorded for this task
- greeting-command: NOT RUN — no results recorded for this task

