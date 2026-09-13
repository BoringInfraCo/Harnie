# Productivity qualification study v1

Status: ready to collect; no confirmatory trials enrolled yet.

This study qualifies the narrow claim that a Harnie handoff substantially
reduces developer re-explanation compared with the same continuation attempt
without a handoff. It is separate from the preview safety gate and the Pi
receiver matrix. Pi is not required: the minimum design can use five paired
Codex receiver trials and five paired OpenCode receiver trials across at least
three registered tasks.

The predeclared design, category definitions and thresholds are in
[`docs/EVALUATION-PROTOCOL.md`](../EVALUATION-PROTOCOL.md). The executable
aggregator is:

```sh
node scripts/eval-continuation.mjs qualify-productivity --dir docs/research
```

Current evidence is exploratory only. The existing successful pairs were
collected before this threshold was declared, use fully specified benchmark
prompts, and record `developerReExplanation: not-needed` in both conditions.
They cannot be promoted into a confirmatory result. Their mixed wall-time
differences likewise do not establish the claim.

## Collection plan

1. Use a candidate tag or immutable 40-character SHA and fresh run id for each
   pair. Enroll it at creation with `--study productivity-v1`.
2. Match task, candidate, receiver, model, limits and verification between the
   handoff and baseline conditions. Alternate which condition is run first.
3. Start both conditions with the same minimal continuation request. A human
   operator supplies clarification only when the receiver requests it and
   preserves that interaction as evidence.
4. A reviewer fills the human metrics without using elapsed time to infer the
   re-explanation category. `not-needed` and `unknown` remain unscored.
5. Curate and integrity-check the evidence, then run the productivity
   aggregator. Do not publish a savings claim unless it returns `ESTABLISHED`.

## Local receiver availability observed 2026-09-11

- Codex CLI 0.149.1 is installed and reports `Logged in using ChatGPT`; it can
  support non-Pi trials without purchasing OpenRouter capacity.
- OpenCode 1.18.30 is installed. Its credential listing could not be verified
  from the restricted audit process because OpenCode attempted to write its
  user-level log; prior evidence shows the configured `opencode-go` receiver
  worked, but authentication should be probed before scheduling trials.
- No real receiver trials were launched during this preparation pass.

The remaining work is evidence collection with a human clarification loop,
not harness implementation or Pi funding.
