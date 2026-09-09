# Continuation evaluation results — 2026-09-08 (Order 5 extended)

> **RECLASSIFIED 2026-09-09 (post-rc.2 re-audit, P1 finding).** The runs below
> demonstrate **RECEIVER COMPATIBILITY**, not the directed handoff paths: every
> handoff here was rendered *for* its receiver's own harness (Pi→Pi,
> Codex→Codex, OpenCode→OpenCode — source harness = target harness). The
> DIRECTED matrix required by `docs/internal/ROADMAP.md:200` (Pi → Harnie →
> OpenCode; OpenCode → Harnie → Pi; Codex → Harnie → Pi/OpenCode) lives in
> **[docs/research/eval-2026-09-09/](../eval-2026-09-09/README.md)**. This
> evaluation also ran against the **rc.1 commit `12dda05`**, not the rc.2
> candidate (`0231dd7` / tag `v0.1.0-rc.2`); the directed matrix in
> eval-2026-09-09 evaluates `v0.1.0-rc.2`. Historical results below are
> preserved unchanged apart from this header.

Raw outcome evidence for the extended Order 5 continuation evaluation, closing
the coverage gaps flagged by the 2026-09-08 re-audit of the rc.1 evaluation
(`docs/research/eval-2026-09-07/`, which remains the rc.1 record and is NOT
superseded or modified). Protocol:
[docs/internal/EVALUATION-PROTOCOL.md](../../internal/EVALUATION-PROTOCOL.md).

Executed 2026-09-08 by an agent (opencode-go/omen-alpha). Every claim below is
backed by a file in this directory; disposable originals (clones, receiver
session DBs) additionally live in
`/var/folders/.../T/opencode/harnie-eval2/`.

## Environment

| Field | Value |
| --- | --- |
| Node / platform | v22.23.0 / darwin |
| Repo ref under evaluation | committed HEAD `12dda05279cfbe3e9776ee9966c6d8932c4d984a` (clone ref `HEAD` per `run.json`) |
| Receivers | `opencode` 1.18.29 (`run --auto`), `pi` 0.84.4 (`--print`), `codex` 0.149.1 (`exec --sandbox workspace-write`) — all three exercised live |
| Models | pi: `openrouter/moonshotai/kimi-k2.5`; codex: default config model `gpt-5.6-sol`; opencode: `opencode-go/kimi-k2.7-code` |
| Harnie home | temp store `/var/folders/.../T/opencode/harnie-home-eval2` (`harnie init`ed fresh) for **every** harnie invocation; `~/.harnie` never used by this evaluation |
| Live agent invocations | 9 total (2 pi smoke + 7 receiver runs), bounded under the ~16 budget; no run hit the 10-minute kill timeout (max wall 336.4s) |

Model notes: `openrouter/moonshotai/kimi-k2.6` (the model of the machine's real
prior pi session) failed with HTTP 402 (openrouter key credits cannot fund a
235K max-token request); pi used `kimi-k2.5` (4.1K max output) instead —
recorded honestly, not hidden. `opencode-go/kimi-k2.7-code` reused from rc.1.

## Containment (verified, not assumed)

The rc.1 evaluation suffered a harness `PWD` escape. This evaluation verified
containment three ways:

1. **Code**: harness pins `PWD`/`OLDPWD` to the clone and strips
   `OPENCODE`/`OPENCODE_PID`/`AGENT` env markers before spawning
   (`scripts/eval-continuation.mjs:576-580`); the manual unrelated-repo runner
   replicates the identical env logic.
2. **Receiver session projects**: every receiver session's project path (from
   `harnie sessions` against the real receiver homes) equals a clone path under
   `.../T/opencode/harnie-eval2/` — see the six ids listed under Raw evidence.
3. **Working tree**: `git status --porcelain` of the real repo before vs after
   all runs is unchanged except the concurrent agent's own edits (a second
   agent was modifying `src/cli/handoff.ts`, `src/cli/show.ts`,
   `src/store/*.ts` during this session — none of the evaluation's task-target
   files `src/cli.ts`, `scripts/prepare-bin.mjs`, `docs/internal/FIRST-RUN.md`,
   `tests/regression-help.test.ts` appear in either snapshot).
   Caveat recorded honestly: `~/.harnie`'s mtime changed at 10:12 during the
   eval window; no harnie invocation in this evaluation used the default home
   (all were run with an explicit temp `HARNIE_HOME`); the touch coincides with
   the concurrent agent's activity and could not be attributed further.

## Real prior sessions (item 4 of the re-audit)

Discovered via `harnie sessions` (read-only scan of real homes) with the temp
`HARNIE_HOME`; imported **read-only** into the temp store; only the rendered
handoff packages entered this repo (under `driver/`):

| Session | Harness | Events | Use |
| --- | --- | --- | --- |
| codex `01a06ce3-76bb-7832-ac8c-81b53bc09a0a` (2026-09-04, this repo) | codex rollout JSONL | 248 | **Driver context for the codex receiver run** → `handoff --to codex` (3233 chars, bounded: `[+4254 chars omitted]` in Goal, `[+47 more omitted]` in Operations) |
| pi `01a062a7-9294-7253-bd74-7d8dfdecbfcd` (2026-09-02, this repo) | pi JSONL | 4 | Real-session handoff path verified (`handoff --to pi`, 752 chars) — content is a trivial `print-help` exchange, so it was **not** usable as receiver driver context (recorded as a limitation, not papered over) |

Secret scan of both real-session handoffs (patterns: `sk-…`, `AKIA…`, `ghp_…`,
private-key blocks, `xox[bp]-…`, long `api_key=…` assignments): **no raw
credentials found**; the product's redaction/bounding handled the real session
(its Goal section is machine-generated plugin boilerplate, truncated by the
bounder, and contains no secrets).

## What ran (7 valid receiver invocations, run `eval-20260908T1030` + `-r1`/`-r2`)

| Leg | Task / repo | Condition | Receiver | Exit | Wall | Files edited | Out-of-scope | Verified | Handoff chars |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| cross-harness pi | version-flag (Harnie clone) | handoff | pi `--print` | 0 | 75.4s | src/cli.ts | none | pass (evaluator) | 1766 |
| cross-harness codex | shebang-guard (Harnie clone) | handoff | codex `exec` | 0 | 205.7s | scripts/prepare-bin.mjs | none | pass (receiver + evaluator) | 3233 (real session) |
| long session | help-regression-test (Harnie clone) | handoff | opencode | 0 | 42.9s | tests/regression-help.test.ts (new) | none | pass (evaluator) | 3100 (4 exec / 52 events) |
| repeat trial 1 | version-flag (Harnie clone) | handoff | opencode | 0 | 146.1s | src/cli.ts | none | pass (evaluator) | 1712 |
| repeat trial 2 | version-flag (Harnie clone) | handoff | opencode | 0 | 107.5s | src/cli.ts | none | pass (evaluator) | 1712 |
| unrelated repo | unrelated-slugify (scratch repo `e84fc64`) | handoff | opencode | 0 | 336.4s | src/slugify.ts, tests/slugify.test.ts (new) | none | pass (evaluator) | 2166 |
| unrelated repo | unrelated-slugify (scratch repo) | baseline | opencode | 0 | 218.3s | src/slugify.ts, tests/slugify.test.ts (new) | none | pass (evaluator) | N/A |

Per-leg detail:

- **Cross-harness pi (bidirectional pi path)**: synthetic pi-format driver
  session (pi-native JSONL, `driver-pi_version-flag.jsonl`) →
  `harnie handoff --to pi` (1766 chars) → `pi --print` receiver. The receiver
  went straight to the handoff's file pointers and made a single edit (census:
  1 `edit` call) producing exactly one `--version` branch reading
  `package.json`. Its sandbox could not execute `node`/`npm`, so it reported
  verification **blocked** rather than claiming success — no false completion.
  The evaluator independently re-ran in the clone: build ok, `--version`
  prints `0.1.0-rc.1` exit 0, cli-init tests 7/7.
- **Cross-harness codex (bidirectional codex path, real driver)**: REAL codex
  session imported → `handoff --to codex` → `codex exec --sandbox
  workspace-write` receiver. The handoff's subject (Sprint 024/025 status) was
  unrelated to the shebang-guard task; the receiver correctly prioritized the
  explicit task statement, did not act on unrelated handoff content, made one
  edit to `scripts/prepare-bin.mjs` (+9/-2), and itself ran both guard paths
  plus `test:package`. Evaluator re-ran all four verification steps: 0 / 1
  (with `Error: dist/cli.js is missing the required shebang (#!).`) / 0 / 0.
- **Long session**: Work built from 4 synthetic opencode executions
  (import + 3× `--work` attach), 52 events, converging on an explicit plan;
  `handoff --to opencode` = 3100 chars. The receiver's next action matched the
  plan exactly: created `tests/regression-help.test.ts` with the capture()
  pattern and the four pinned strings (census bash×4, read×3, write×1);
  vitest 1/1 + `tsc --noEmit` clean re-verified by the evaluator.
- **Repeated trials**: same version-flag handoff package (1712 chars) run
  twice. Both completed with exactly one `--version` branch and no repeated
  finished edits; tool census differs (r1: bash×12/edit×3/read×2;
  r2: bash×5/edit×2/glob×1/read×6) and wall time varies 146.1s → 107.5s
  (~27%). r1's 3 edits are progressive hunks (import + version const + branch)
  of one edit pass, not re-edits of finished state.
- **Unrelated repository**: scratch git repo (`slugify-util`, commit
  `e84fc64`, 5 files) outside the Harnie repo. Handoff-conditioned run created
  exactly `src/slugify.ts` + `tests/slugify.test.ts` (vitest 6/6;
  `slugify('  Hello, World! ') === 'hello-world'`, `slugify('') === ''`
  re-verified by evaluator). Baseline run: same two files, vitest 5/5, more
  exploration (bash×7/glob×5/read×7/write×2 vs bash×9/glob×5/read×9/write×2
  — and handoff was **slower** here, 336.4s vs 218.3s: opposite direction from
  rc.1's wall-time pattern, n=1 pair, treat as anecdote, recorded honestly).

## Preview gate — PASS/FAIL on "no false completion or repeated completed edits"

**PASS** — across all 7 receiver runs (3 harnesses, 2 repos, 5 distinct
handoff packages): zero false completions (every completion claim is
corroborated by the recorded diff and the evaluator's independent
re-verification; the one run that could not verify — pi — said so explicitly
instead of claiming success), zero repeated finished edits (single edit pass
per run; final states contain no duplicated logic; opencode/pi tool census
recorded above), zero out-of-scope edits.

## Receiver CLI survey (item 2 of the re-audit)

| CLI | Version | Non-interactive mode (from `--help`) | Worked? |
| --- | --- | --- | --- |
| pi | 0.84.4 | `--print, -p` — "Non-interactive mode: process prompt and exit"; tools enabled by default; `--model` supports "provider/id" | YES (`pi -p --model openrouter/moonshotai/kimi-k2.5`) |
| codex | 0.149.1 | `codex exec` — "Run Codex non-interactively"; `exec` never prompts; `--sandbox workspace-write` (no `--full-auto` flag exists) | YES (default config model `gpt-5.6-sol`) |
| opencode | 1.18.29 | `run` + `--auto` — "auto-approve permissions that are not explicitly denied" | YES (`opencode-go/kimi-k2.7-code`, as rc.1) |

Model availability failure recorded: pi with
`openrouter/moonshotai/kimi-k2.6` → HTTP 402 "requires more credits … can only
afford 9813" (the key cannot fund that model's 235K max-token requests);
switched to `kimi-k2.5` (4.1K max output), which succeeded.

## Reporting-bug fix verified (re-audit finding at `scripts/eval-continuation.mjs:475`)

The bug: baseline results inherited the `--handoff` path/size, so the
2026-09-07 `summary.md` showed handoff char counts (e.g. 1654) on baseline
rows. Fixed this pass:

- `scripts/eval-continuation.mjs` now scopes `--handoff` to the handoff
  condition only (`conditionHandoff()`); baseline `result.json` records
  `handoff: {path: null, chars: null, sha256: null}`, and `summarize` renders
  baseline rows `N/A` and reports `packageSizeChars: null` unless the baseline
  measured its own package.
- New tests in `tests/eval-harness.test.ts` prove the fix on both run paths
  (mocked-agent and manual-run fallback): baseline prompt contains no handoff
  content; baseline `handoff` object is `{path: null, chars: null,
  sha256: null}` in both `result.json` and `result-template.json`; summary.json
  baseline row `packageSizeChars === null`; summary.md baseline row contains
  `N/A` and not the handoff size. Full suite: **346 passed (346)**,
  `tsc --noEmit` clean. (`vet --agentic` review of the fix found one leftover
  use of the global handoff path in the manual-run branch — fixed and covered
  by the manual-mode test before final registration; the review's third
  finding concerned `src/store/fork.ts`, which is another agent's concurrent
  work, not this change.)

## Raw evidence map

- `summary.md` / `summary.json` — gate coverage + this run's tables.
- `runs/eval-20260908T1030/<leg>/<condition>/` — `result.json` (registered via
  `record`, schema `harnie-eval-result/v1`), `prompt.md` (exact receiver
  prompt), `agent-stdout.log`, `agent-stderr.log`, `edits.diff`;
  `-r1`/`-r2` for the repeat trials; `eval-20260908T1030-summary.{md,json}`
  (harness `summarize` output; `missing` rows are legs intentionally not run
  in this extended pass — see coverage table).
- `runs/eval-20260908T1030/version-flag/handoff/pi-receiver-session.jsonl` —
  pi receiver's own session trace (1 edit call; sessions were redirected to a
  temp dir via `--session-dir`, copied here as evidence).
- `driver/` — generator (`generate-drivers.mjs`), synthetic driver sessions,
  and the six rendered handoff packages actually consumed (`handoff-*.md`),
  including the two real-session handoffs.
- Receiver session references (real homes, read-only): opencode sessions
  `ses_f7e94bb57ffevHoYwZUkJ6Qucq` (r1), `ses_f7e927e24ffeKVaC0KzlX9ilgn` (r2),
  `ses_f7e95ad8affemcZwy9Iz073tW6` (long), `ses_f7e900388ffeB74IGV6zPfvZER`
  (unrelated handoff), `ses_f7e8ae126ffebJECZSvndTHquw` (unrelated baseline);
  codex rollout `~/.codex/sessions/2026/09/08/rollout-2026-09-08T10-23-10-01a08166-….jsonl`
  (shebang-guard receiver, session `01a08166-c254-7460-9c1e-bc65f77232d7`).
- Scratch repo: `/var/folders/.../T/opencode/scratch-repo-eval/slugify-util`
  (commit `e84fc64`); clones: `/var/folders/.../T/opencode/harnie-eval2/`.

## Limitations

- **Sample size**: 7 receiver runs, one per leg (plus 2 repeats of one leg).
  Existence check, not a benchmark. Wall-time and census variance between
  repeats is n=2.
- **Cross-harness baselines not run**: pi/codex receivers were exercised
  handoff-conditioned only (the bidirectional claim); no pi/codex baseline
  comparison. The opencode handoff-vs-baseline comparison was covered by rc.1
  (4 pairs) and the unrelated-repo pair here.
- **One benchmark task per cross-harness receiver** (pi: version-flag; codex:
  shebang-guard); their handoff drivers differ in kind (pi: synthetic; codex:
  real), so cross-receiver comparisons are not apples-to-apples.
- **The real pi session was too trivial to drive a receiver run** (4 events,
  `print-help`); real-session driver coverage is therefore codex-only. The
  opencode live-session driver path was not exercised with a real session
  either (synthetic snapshots; the real opencode DB sessions all belong to
  concurrent dev sessions of this repo and none matched a benchmark task).
- **Receiver environment quirks**: pi's sandbox could not execute node/npm
  (verification blocked in-run; evaluator re-verified). codex's `vet`-style
  review CLI crashed on the untracked `node_modules` symlink (receiver
  reported it; unrelated to task correctness).
- `developerReExplanation` judged `not-needed` (no developer in the loop).
