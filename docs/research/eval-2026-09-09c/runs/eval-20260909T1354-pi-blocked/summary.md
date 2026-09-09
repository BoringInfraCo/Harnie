# Continuation evaluation summary — run eval-20260909T1354-pi-blocked

Ref: `v0.1.0-rc.5` → `6ac02e359b3b973c7fc4b4c603a6d2db38b665dc` · tagSha `6ac02e359b3b973c7fc4b4c603a6d2db38b665dc` · Node: v22.23.0 · Platform: darwin · Repo: Harnie

| Task | Condition | Source→Target | Status | Agent | Model | tagSha | Handoff sha256 (first 12) | Exit | Files edited | Out-of-scope | Verification | Repeated finished edits | False completion | Completed | Handoff chars |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| version-flag | handoff | opencode→pi | not-run | pi |  | 6ac02e359b3b | 1fc50145d413 |  |  |  | unknown | unknown | unknown | unknown | 1736 |
| version-flag | baseline | baseline→pi | not-run | pi |  | 6ac02e359b3b |  |  |  |  | unknown | unknown | unknown | unknown | N/A |
| shebang-guard | handoff | codex→pi | not-run | pi |  | 6ac02e359b3b | da0b1468e96b |  |  |  | unknown | unknown | unknown | unknown | 3225 |
| shebang-guard | baseline | baseline→pi | not-run | pi |  | 6ac02e359b3b |  |  |  |  | unknown | unknown | unknown | unknown | N/A |
| first-run-recovery | handoff | | missing | | | | | | | | | | | | |
| first-run-recovery | baseline | | missing | | | | | | | | | | | | |
| help-regression-test | handoff | | missing | | | | | | | | | | | | |
| help-regression-test | baseline | | missing | | | | | | | | | | | | |
| greeting-command | handoff | | missing | | | | | | | | | | | | |
| greeting-command | baseline | | missing | | | | | | | | | | | | |

## Preview gate (initial)

- version-flag: FAIL — handoff: status=not-run (OpenCode->Pi extra handoff trials (leg a, trials 2-3 of the >=3-trial target, bound to v0.1.0-rc.5 / 6ac02e3): NOT RUN - pi receiver provider unfunded, re-verified by cheap probes 2026-09-09T13:54Z (probes/): pi/openrouter moonshotai/kimi-k2.5 -> 402 openrouter_credits ('You requested up to 4096 tokens, but can only afford 2422'; credits do not reset); pi/openrouter cohere/north-mini-code:free -> 429 openrouter_free_tier_daily (X-RateLimit-Remaining: 0; account-wide 50/day key contested; X-RateLimit-Reset 2026-09-10T00:00Z). Per pass rule: probe failure -> no receiver invocation spent, no budget burned on retries.); baseline: status=not-run (OpenCode->Pi baseline (leg a, bound to v0.1.0-rc.5 / 6ac02e3): NOT RUN - pi receiver provider unfunded, re-verified by cheap probes 2026-09-09T13:54Z (probes/): pi/openrouter moonshotai/kimi-k2.5 -> 402 openrouter_credits ('You requested up to 4096 tokens, but can only afford 2422'; credits do not reset); pi/openrouter cohere/north-mini-code:free -> 429 openrouter_free_tier_daily (X-RateLimit-Remaining: 0; account-wide 50/day key contested; X-RateLimit-Reset 2026-09-10T00:00Z). Per pass rule: probe failure -> no receiver invocation spent, no budget burned on retries.)
- shebang-guard: FAIL — handoff: status=not-run (Codex->Pi handoff (leg b, bound to v0.1.0-rc.5 / 6ac02e3): NOT RUN - pi receiver provider unfunded, re-verified by cheap probes 2026-09-09T13:54Z (probes/): pi/openrouter moonshotai/kimi-k2.5 -> 402 openrouter_credits ('You requested up to 4096 tokens, but can only afford 2422'; credits do not reset); pi/openrouter cohere/north-mini-code:free -> 429 openrouter_free_tier_daily (X-RateLimit-Remaining: 0; account-wide 50/day key contested; X-RateLimit-Reset 2026-09-10T00:00Z). Per pass rule: probe failure -> no receiver invocation spent, no budget burned on retries.); baseline: status=not-run (Codex->Pi baseline (leg b, bound to v0.1.0-rc.5 / 6ac02e3): NOT RUN - pi receiver provider unfunded, re-verified by cheap probes 2026-09-09T13:54Z (probes/): pi/openrouter moonshotai/kimi-k2.5 -> 402 openrouter_credits ('You requested up to 4096 tokens, but can only afford 2422'; credits do not reset); pi/openrouter cohere/north-mini-code:free -> 429 openrouter_free_tier_daily (X-RateLimit-Remaining: 0; account-wide 50/day key contested; X-RateLimit-Reset 2026-09-10T00:00Z). Per pass rule: probe failure -> no receiver invocation spent, no budget burned on retries.)
- first-run-recovery: NOT RUN — no results recorded for this task
- help-regression-test: NOT RUN — no results recorded for this task
- greeting-command: NOT RUN — no results recorded for this task

