# Order 5 — Continuation evaluation protocol (scaffolding)

Audit source: [LAUNCH-READINESS-AUDIT-2026-09-05.md](LAUNCH-READINESS-AUDIT-2026-09-05.md), Order 5 (line 140) and line 145. This document defines the benchmark task set, the evaluation harness, the results schema, and the exact commands to execute the evaluation on the release candidate. Scaffolded 2026-09-07.

Harness: [`scripts/eval-continuation.mjs`](../../scripts/eval-continuation.mjs). Results dir convention: `docs/research/eval-2026-09-07/` (final, curated results land there; raw machine evidence lives in the disposable run dirs under `/var/folders/.../T/opencode/harnie-eval/`).

## 1. Benchmark task set (4 unrelated tasks)

Tasks are deliberately unrelated: they touch **disjoint files** in different concerns (CLI argument surface, build packaging, onboarding docs, test coverage), so evaluations do not interfere and edits cannot be attributed to the wrong task.

| Task id | Area | Files touched | Statement (short) |
| --- | --- | --- | --- |
| `version-flag` | cli-args | `src/cli.ts` | Add `--version` printing the package version, exit 0. |
| `shebang-guard` | build-script | `scripts/prepare-bin.mjs` | Fail with a clear stderr message when `dist/cli.js` lacks a shebang. |
| `first-run-recovery` | docs | `docs/internal/FIRST-RUN.md` | Add a `## Recovery` section documenting backup/restore and the no-undo caveat. |
| `help-regression-test` | tests | `tests/regression-help.test.ts` (new) | New regression test pinning the CLI help surface (backup/restore/handoff/import strings). |

The authoritative per-task statement, exact edit, verification commands, and expected end state live in the registry in `scripts/eval-continuation.mjs` (`TASKS`); `node scripts/eval-continuation.mjs tasks` prints them. The registry is the single source of truth; this section summarizes it.

Why these four: each is small (single-file edit or new test), fully verifiable with local commands (no network), representative of receiver failure modes the audit cares about (verifying before/after edits, not re-doing finished edits, correct next action), and independent — running task A cannot change the starting state of task B.

## 2. Conditions and the comparison

For each task, two conditions run on **identical clones** (same commit, same node_modules, same verification commands):

- **`handoff`** — receiver gets the task statement **plus** the Harnie handoff artifact produced from a prior ("driver") session on that task. It is told to use the handoff and not re-investigate from scratch.
- **`baseline`** — fresh receiver gets **only the task statement** (identical task text and working rules; no prior-session context).

Both conditions receive the identical task statement, required verification list, expected end state, and working rules (make the edits, run verification, do not commit, print a report). The only difference is the handoff block. This measures the handoff's value-add on the same task state.

Producing the handoff artifact for the `handoff` condition is Order 5 execution work: a driver agent performs (or partially performs) a benchmark task in a scratch `HARNIE_HOME`, the built CLI imports that session and renders `harnie handoff <work> --to <target>`, and the resulting Markdown is passed to the harness via `--handoff <path>`.

## 3. Harness design

`scripts/eval-continuation.mjs` is dependency-free Node 22. Everything disposable lives under `${os.tmpdir()}/opencode/harnie-eval/<run-id>/` — **never** the working tree.

Run dir layout:

```
opencode/harnie-eval/<run-id>/
  run.json                      # runId, repo, ref (resolved sha), node, platform
  <task-id>/
    handoff/
      clone/                    # disposable git clone (node_modules symlinked, not copied)
      prompt.md                 # exact receiver prompt
      agent-stdout.log / agent-stderr.log
      edits.diff                # full uncommitted diff collected after the run
      result.json               # structured outcome (schema below)
      manual-instructions.md / result-template.json   # manual-run mode only
    baseline/
      ...same...
  summary.md / summary.json     # side-by-side comparison + preview-gate line
```

Commands:

| Command | Purpose |
| --- | --- |
| `tasks [--json]` | Print the benchmark registry. |
| `prepare --task <id> [--condition handoff,baseline] [--ref HEAD\|worktree\|<sha>] [--run <id>]` | Create disposable clones only (for manual setups). |
| `run --task <id> [--condition ...] [--agent opencode\|codex\|pi] [--handoff <path>] [--model <provider/model>] [--agent-arg <a>]... [--ref HEAD\|worktree\|<sha>] [--run <id>] [--timeout <ms>] [--agent-command "<argv...>"]` | Prepare clone(s) → write prompt → invoke receiver non-interactively (or degrade to manual mode) → collect evidence → write `result.json`. |
| `collect --dir <condition dir>` | Re-collect git status/diff + handoff size into `result.json` (after a manual run). |
| `record --dir <condition dir> --file <result.json>` | Validate a filled result against the schema and register it. |
| `summarize --run <run-id>` | Side-by-side `summary.md`/`summary.json`, incl. the preview-gate line. |
| `verify-evidence --dir <curated eval dir>` | Integrity check over a curated `docs/research/eval-<date>/` dir: every referenced file exists (relative to its result.json); handoff artifact sha256s match the recorded hashes; every result belongs to its run dir and matches its path; every run dir has `run.json` + `summary.{md,json}`; no machine-local absolute paths in the records (`disposable:`-prefixed tmp-only refs are skipped; raw log content is exempt). Non-zero exit on any finding. |

Key properties:

- **Identical environments**: each condition gets a fresh `git clone --no-hardlinks` of the repo checked out at the same resolved ref (`HEAD` by default; `worktree` snapshots the current working tree via a throwaway temp-index + `git commit-tree` without touching the real index; or any commit sha). `node_modules` is symlinked from the repo so verification runs offline (no `npm ci`).
- **Agent-agnostic**: the harness does not assume what the final CLI looks like; it clones whatever the ref contains and runs verification through the clone's own build.
- **Mock injection**: `--agent-command "<argv...>"` (or env `HARNIE_EVAL_AGENT_COMMAND`) replaces the real receiver binary — used by tests. Placeholders `{prompt_text}`, `{prompt_file}`, `{clone}` are substituted.
- **No fabricated results**: the harness records what actually happened (exit code, logs, git status/diff, handoff size) and marks human-judged metrics `unknown`; only a human/next agent fills them via `record`, and `record` rejects results that fail schema validation or lie about shape. Manual mode marks status `manual`, never `ran`.

## 4. Results schema (`harnie-eval-result/v1` and `v2`)

One JSON per task/condition. Validated by `record` (and by `validateResult`,
unit-tested). Versioning (2026-09-10 re-audit remediation):

- **`harnie-eval-result/v1`** — the original schema, retained for **archived**
  results (2026-09-07 / 2026-09-08 evidence). Does not require the
  directed-matrix provenance fields. Archived v1 files are never rewritten to
  v2; `validateResultV1` / `record` keep accepting them.
- **`harnie-eval-result/v2`** — current generation. Requires the provenance
  fields below. The 2026-09-09 records (which carry the fields) were stamped
  `schema: "harnie-eval-result/v2"` in place — they are current-generation
  evidence. The validator dispatches on the record's declared `schema` field;
  `record` accepts both versions.

| Field | Type / allowed values | v1 | v2 |
| --- | --- | --- | --- |
| `schema` | `"harnie-eval-result/v1"` \| `"harnie-eval-result/v2"` | required (v1) | required (v2) |
| `runId`, `taskId`, `recordedAt` | non-empty strings | required | required |
| `condition` | `handoff` \| `baseline` | required | required |
| `status` | `ran` \| `manual` \| `not-run` (+ `notRunReason`) | required | required |
| `environment` | `{ agent, agentVersion, model, node, platform, ref, clonePath }` — model/environment details are mandatory, per the audit | required | required |
| `sourceHarness` | driver harness name (`pi`/`opencode`/`codex`) or `null` for baseline | optional | **required** |
| `targetHarness` | receiver harness name, non-empty | optional | **required** |
| `tagSha` | resolved 40-hex commit sha of the evaluated ref | optional | **required** |
| `refName` | non-empty string (e.g. `v0.1.0-rc.3`) | optional | **required** |
| `handoffArtifactSha` | 64-hex sha256 of the exact handoff file consumed, or `null` | optional | **required** |
| `handoff` | `{ path, chars, sha256 }` — chars = **package size (chars)** | required | required |
| `execution` | `{ invocation, exitCode, signal, wallMs, stdoutLog, stderrLog }` | required | required |
| `commandsRun` | array of `{ cmd, purpose }` (filled by the observer, not guessed) | required | required |
| `edits` | `{ files, outOfScopeFiles, diffChars, diffPath }` | required | required |
| `verification` | `{ ran, commands, passed, details }` | required | required |
| `metrics` | the audit line 145 set, below | required | required |
| `notes` | free text — failures and anything surprising | required | required |

**Path convention in records (v2, 2026-09-10):** every file reference
(`stdoutLog`, `stderrLog`, `edits.diffPath`, `handoff.path`, `patch.path`) is a
path **relative to the directory containing `result.json`**; `environment.clonePath`
is prefixed `disposable:` and is relative to the run dir (clones live only in
the disposable tmp store); `run.json`'s `repo` records the repo directory
**name**, never a machine-local absolute path; `execution.invocation[0]` records
the binary name, not its absolute path. Raw receiver logs are evidence and are
never rewritten, so quoted machine paths inside log/prompt **content** are
acceptable; the path fields themselves must be portable. `verify-evidence`
enforces all of this.

Run manifest schema: `harnie-eval-run/v2` (same shape as v1; `repo` is now the
repo name instead of an absolute path — the evaluated commit is identified by
`refName` + `tagSha`). The per-run `summary.json` schema
(`harnie-eval-summary/v1`) is unchanged — no shape change, no bump.

`metrics` enums (honest defaults are `unknown`/`null`):

- `developerReExplanation`: `none|partial|full|not-needed|unknown`
- `repeatedInvestigation`: `none|partial|full|unknown`
- `repeatedFinishedEdits`: `none|yes|unknown` — repeated **finished** edits
- `nextActionCorrect`: `yes|no|partial|unknown`
- `missingOrFalseContext`: `none|missing|false|both|none-needed|unknown`
- `taskCompleted`: `true|false|null`
- `falseCompletion`: `true|false|null` — receiver claimed completion without evidence
- `packageSizeChars`: number|null

**Initial preview gate** (per audit line 145): for the selected benchmark tasks, PASS requires `falseCompletion !== true` and `repeatedFinishedEdits !== "yes"` in every condition, with verification passing. `summarize` prints this per task with explicit FAIL reasons; failures and environment details are always reported, not just a GO label. `unknown`/`null` human metrics still require review before any gate claim.

**Verdict rules (two-verdict framing, mandatory since the 2026-09-10 re-audit):**
every evaluation report MUST report two separate verdicts; a PASS on the first
is never a PASS on the second.

- **Verdict A — safety behavior among completed runs.** Whether the runs that
  actually completed exhibited no false completion, no repeated finished
  edits, and no out-of-scope edits, with verification. Failed/blocked runs do
  not count toward A (positively or negatively) — but they are always listed.
- **Verdict B — full Order 5 matrix / protocol gate.** PASS **only if every
  required condition of every required leg ran and verified** (handoff AND
  baseline; all requested trials). Excluding failed runs from B is not
  permitted: blocked conditions keep B at **PARTIAL / INCONCLUSIVE**, with the
  exact reason per leg recorded. Verdict B is the gate the release decision
  consumes; verdict A alone must never be reported as "the evaluation passed".

## 5. Receiver-runner support per available CLI

Detected on this machine (2026-09-07): `opencode` (`~/.opencode/bin/opencode`), `pi` (`~/.local/bin/pi`), `codex` (`~/.local/bin/codex`).

| Agent | Non-interactive invocation (run in the clone) | Notes / caveats |
| --- | --- | --- |
| `opencode` | `opencode run --auto "<prompt>"` | Verified 2026-09-07 against opencode 1.18.29: `run` exposes `--auto` and `-m/--model`. `--auto` auto-approves non-denied permissions (required for edits in `run` mode). |
| `codex` | `codex exec --sandbox workspace-write "<prompt>"` | Verified 2026-09-07 against codex-cli 0.149.1: `--full-auto` does **not** exist; `codex exec` is non-interactive (never prompts) and `--sandbox workspace-write` grants clone-edit access. `-m <model>` is an `exec` option. |
| `pi` | `pi --print "<prompt>"` | Verified 2026-09-07 against pi 0.84.4: read/bash/edit/write tools enabled by default in `--print`; `--model <pattern>` supports `provider/id`; default provider is `google`. |

Model flags are injected per agent (after the subcommand, via the harness's per-agent `modelArgs`); the harness records the exact invocation in `execution.invocation` regardless.

Runner behavior: if the agent name is unknown, the binary is missing from `PATH`, or non-interactive mode proves infeasible, the harness **degrades to manual-run mode**: it writes `manual-instructions.md` (exact shell commands + record/collect instructions) and `result-template.json`, marks the result `manual`, and never invents outcomes. Before relying on any agent default, verify its flags with `<agent> --help`; use `--agent-arg` for anything agent-specific.

## 6. Exact commands for Order 5 execution

```sh
# 0. Confirm the RC and create the run id
git rev-parse HEAD                     # the ref under evaluation (or commit the RC first)
RUN=eval-$(date +%Y%m%dT%H%M%S)

# 1. Baseline + handoff-conditioned runs for each task (real agent)
#    handoff condition needs the artifact produced from the driver session first
node scripts/eval-continuation.mjs run --task version-flag --condition handoff,baseline \
  --agent opencode -m <provider/model> --run $RUN --ref HEAD \
  --handoff /path/to/handoff.md        # omit --handoff for pure-baseline pairing

# repeat per task: shebang-guard, first-run-recovery, help-regression-test

# 2. If a run degraded to manual mode, execute it by hand per manual-instructions.md, then:
node scripts/eval-continuation.mjs collect --dir <run-dir>/<task>/<condition>
# ...fill the human-judged metrics in result.json...
node scripts/eval-continuation.mjs record --dir <run-dir>/<task>/<condition> --file result.json

# 3. Side-by-side comparison + preview gate
node scripts/eval-continuation.mjs summarize --run $RUN

# 4. Curate final evidence into the repo (raw run dirs stay disposable in /var/folders)
cp <run-dir>/summary.md docs/research/eval-2026-09-07/
# + one result.json per task/condition + notes on failures, model, environment
```

Do not run real agent invocations while only scaffolding — that is the next step.

## 7. Known gaps / TODO before execution

- ~~Codex `--full-auto` and pi `--print` tool-permission behavior must be confirmed against the installed versions~~ Verified 2026-09-07: codex-cli 0.149.1 has no `--full-auto` (harness now uses `exec --sandbox workspace-write`); pi 0.84.4 enables tools by default in `--print`. The harness records the exact invocation regardless.
- The harness cannot automatically attribute *which commands the receiver ran* (`commandsRun`) or judge the human metrics; these are filled from agent logs / receiver reports via `record` and stay `unknown` until then.
- `--ref worktree` snapshots tracked + untracked-but-not-ignored files; an unexpectedly dirty tree (e.g. scratch dirs not in `.gitignore`) would leak into the snapshot — prefer a committed RC ref.
- An npm alias (`"eval:continuation": "node scripts/eval-continuation.mjs"`) is suggested but not added (package.json is out of scope here); use the long form.
- **Execution lessons (2026-09-07, fixed in the harness):** (a) `spawnSync(cwd)`
  does not update the `PWD` env var, and `opencode run` resolves its project
  from `PWD` — the first evaluation attempt escaped its clones and edited the
  real repo; the harness now pins `PWD`/`OLDPWD` to the clone and strips
  outer-agent env markers. (b) The `-m` spelling was not parsed (now an alias
  for `--model`). (c) The `git()` helper must not trim `git status
  --porcelain` output (leading status column). Details:
  [docs/research/eval-2026-09-07/README.md](../research/eval-2026-09-07/README.md).
