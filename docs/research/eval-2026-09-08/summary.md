# Extended evaluation summary — run eval-20260908T1030 (2026-09-08, Order 5)

> **RECLASSIFIED 2026-09-09 (post-rc.2 re-audit, P1 finding).** The runs below
> demonstrate **RECEIVER COMPATIBILITY**, not the directed handoff paths: every
> handoff in this directory was rendered *for* its receiver's own harness
> (Pi→Pi, Codex→Codex, OpenCode→OpenCode — i.e. source = same harness as the
> target). The DIRECTED matrix required by `docs/internal/ROADMAP.md:200`
> (Pi → Harnie → OpenCode; OpenCode → Harnie → Pi; Codex → Harnie → Pi/OpenCode)
> lives in **[docs/research/eval-2026-09-09/](../eval-2026-09-09/README.md)**.
> Note also that this evaluation ran against the **rc.1 commit `12dda05`**, not
> the rc.2 candidate (`0231dd7` / tag `v0.1.0-rc.2`); the directed matrix in
> eval-2026-09-09 evaluates `v0.1.0-rc.2`. The historical results below are
> preserved as-is; only this header and the README header were added.

Companion to [README.md](README.md) (full report). Extends — does not replace —
`docs/research/eval-2026-09-07/` (rc.1 record). Ref: committed HEAD
`12dda05` · Node v22.23.0 · darwin · temp Harnie home
`.../T/opencode/harnie-home-eval2` for all harnie invocations.

## Gate coverage table (Order 5 elements flagged by the re-audit)

| Element | Status | Evidence |
| --- | --- | --- |
| Handoff vs baseline comparison | **met** (rc.1) + extended | rc.1: 4 paired tasks, `docs/research/eval-2026-09-07/`; this pass adds an unrelated-repo pair (handoff 336.4s / baseline 218.3s — handoff slower here, n=1, honest outlier vs rc.1's 4/4 faster) |
| Receiver: opencode | **met** (rc.1 + 4 more runs here) | `runs/eval-20260908T1030/help-regression-test/handoff`, `unrelated-slugify/*`, `-r1`, `-r2` |
| Receiver: pi (non-interactive) | **met** | `pi -p` 0.84.4, model `openrouter/moonshotai/kimi-k2.5`; `runs/eval-20260908T1030/version-flag/handoff` (result.json agent=pi, + pi session trace) |
| Receiver: codex (non-interactive) | **met** | `codex exec --sandbox workspace-write` 0.149.1, model `gpt-5.6-sol`; `runs/eval-20260908T1030/shebang-guard/handoff` (result.json agent=codex) |
| Bidirectional path (handoff rendered *for* the receiver's harness) | **met** | pi: `handoff --to pi` (1766 chars) consumed by pi receiver; codex: `handoff --to codex` (3233 chars, from a real codex session) consumed by codex receiver; opencode: `--to opencode` ×4. Handoff packages in `driver/handoff-*.md`, consumed verbatim in each `prompt.md` |
| Unrelated repository | **met** | scratch git repo `slugify-util` (commit `e84fc64`) outside Harnie; both conditions pass verification; `runs/eval-20260908T1030/unrelated-slugify/` |
| Long / multi-execution session | **met** | 4 executions / 52 events (import + 3× `--work` attach), handoff 3100 chars with truncation markers; receiver's next action matched the handoff's convergent plan exactly (correct file, pattern, strings) |
| Repeated trials | **met (n=2)** | same 1712-char handoff run twice: both complete, one `--version` branch each, no repeated edits; wall 146.1s vs 107.5s (~27% variance); census differs |
| Real prior sessions as driver context | **partially met** | real codex session (248 events) drove the codex receiver run; real pi session was trivial (4 events, `print-help`) — handoff path verified (752 chars) but unusable as task context; real opencode sessions all belong to concurrent dev sessions, none matched a benchmark task |
| Raw outcome evidence | **met** | per-run `result.json` (registered via `record`), prompts, logs, diffs, receiver session ids/traces, `summary.json` files — all in `runs/` |
| Reporting bug (baseline inherits handoff size) | **met (fixed)** | `scripts/eval-continuation.mjs` scoped `--handoff` to the handoff condition (both agent and manual-run paths); baseline `result.json.handoff` = nulls; `summarize` renders baseline `N/A`; 2 new tests in `tests/eval-harness.test.ts` (mocked-agent + manual mode); suite 346/346 green; vet review of the fix clean after one leftover was caught and fixed |

Not-run items and why (nothing fabricated):

- **pi/codex baseline conditions** — not budgeted (2 receiver models × 2
  conditions × tasks would exceed the ~16-invocation bound); the bidirectional
  claim only requires the handoff-conditioned path, which ran.
- **first-run-recovery re-run** — already covered by rc.1 on the same code
  path; not repeated here.
- **Real opencode live-session driver** — no real opencode session matched a
  benchmark task (all recent ones are concurrent dev sessions of this repo);
  synthetic snapshots used instead, as in rc.1.
- **A larger repeat count / more receivers** — invocation budget (9 of ~16
  used; 10-minute kill timeout never hit, max wall 336.4s).

## PASS/FAIL verdict

**PASS — "no false completion or repeated completed edits"**: 7/7 receiver
runs across pi/codex/opencode, two repos, five handoff packages: every
completion claim corroborated by diff + evaluator re-verification; the
verification-blocked pi run reported blocked instead of claiming success;
single edit pass per run; no out-of-scope edits; no repeated finished edits.

## Models / env

- pi 0.84.4 · `openrouter/moonshotai/kimi-k2.5` (`kimi-k2.6` failed: openrouter
  key 402 credit limit — recorded, not hidden)
- codex-cli 0.149.1 · `gpt-5.6-sol` (user config default)
- opencode 1.18.29 · `opencode-go/kimi-k2.7-code`
- Node v22.23.0, darwin; Harnie `0.1.0-rc.1` tree at commit `12dda05`; all
  harnie state in temp `HARNIE_HOME`; receivers contained to clones (session
  project paths verified); `~/.harnie` never invoked by this evaluation (mtime
  touch during the window attributed to the concurrent agent — see README
  containment section).
