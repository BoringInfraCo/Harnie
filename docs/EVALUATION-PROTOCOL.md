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
| `run --task <id> [--condition ...] [--agent opencode\|codex\|pi] [--handoff <path>] [--model <provider/model>] [--agent-arg <a>]... [--ref HEAD\|worktree\|<sha>] [--run <id>] [--timeout <ms>] [--agent-command "<argv...>"] [--attest <string>]` | Prepare clone(s) → write prompt → invoke receiver non-interactively (or degrade to manual mode) → collect evidence → write `result.json`. `--attest <string>` records an execution-time attestation (plus the GitHub Actions env when present) into the manifest once, at manifest-creation time. |
| `collect --dir <condition dir>` | Re-collect git status/diff + handoff size into `result.json` (after a manual run). |
| `record --dir <condition dir> --file <result.json>` | Validate a filled result against the schema and register it. |
| `summarize --run <run-id>` | Side-by-side `summary.md`/`summary.json`, incl. the preview-gate line. |
| `verify-evidence --dir <curated eval dir> [--repo <git dir>] [--fix] [--archival]` | Integrity check over a curated `docs/research/eval-<date>/` dir: every referenced file exists (relative to its result.json); handoff artifact sha256s match the recorded hashes; every result belongs to its run dir and matches its path; every run dir has `run.json` + `summary.{md,json}`; no machine-local absolute paths in the records (`disposable:`-prefixed tmp-only refs are skipped; raw log content is exempt); chronology enforced (`recordedAt` within ±1h of the run manifest, ≤1h past the newest file mtime); the v2 run manifest must be complete (`validateRunV2`, below) and its `runId` must encode the execution timestamp agreeing with `createdAt` within ±10 min in both directions, while `createdAt` must not be future-dated vs the verifier clock; each eval `README.md` must claim every manifest's `createdAt` UTC date; **exact candidate binding** enforced (below); **summary drift** detected — the committed `summary.json` of every run dir is compared against a harness regeneration and must match structurally, and the committed `summary.md` must match the regenerated Markdown **byte for byte** (`--fix` rewrites BOTH outputs from the committed records); `--attest`-captured execution attestations (below) are required present and well-formed; `--archival` (explicit opt-in) downgrades the post-v1-era conventions (run manifests, per-run summaries, machine-path convention, runId/createdAt binding) to loud warnings for the archived 2026-09-07/09-08 dirs — default mode stays strict. Warnings are printed to stderr and never fail the check by themselves. Non-zero exit on any finding. |

Key properties:

- **Identical environments**: each condition gets a fresh `git clone --no-hardlinks` of the repo checked out at the same resolved ref (`HEAD` by default; `worktree` snapshots the current working tree via a throwaway temp-index + `git commit-tree` without touching the real index; or any commit sha). `node_modules` is symlinked from the repo so verification runs offline (no `npm ci`).
- **Agent-agnostic**: the harness does not assume what the final CLI looks like; it clones whatever the ref contains and runs verification through the clone's own build.
- **Mock injection**: `--agent-command "<argv...>"` (or env `HARNIE_EVAL_AGENT_COMMAND`) replaces the real receiver binary — used by tests. Placeholders `{prompt_text}`, `{prompt_file}`, `{clone}` are substituted.
- **No fabricated results**: the harness records what actually happened (exit code, logs, git status/diff, handoff size) and marks human-judged metrics `unknown`; only a human/next agent fills them via `record`, and `record` rejects results that fail schema validation or lie about shape. Manual mode marks status `manual`, never `ran`.

## 4. Results schema (`harnie-eval-result/v1` and `v2`)

One JSON per task/condition. Validated by `record` (and by `validateResult`,
unit-tested). Versioning (2026-09-09 re-audit remediation):

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
| `status` | `ran` \| `manual` \| `not-run` | required | required |
| `notRunReason` | non-empty string | required iff `status: "not-run"` | required iff `status: "not-run"` |
| `environment` | `{ agent, agentVersion, model, node, platform, ref, clonePath }` — model/environment details are mandatory, per the audit | required | required |
| `sourceHarness` | driver harness name (`pi`/`opencode`/`codex`) or `null` for baseline | optional | **required** |
| `targetHarness` | receiver harness name, non-empty | optional | **required** |
| `tagSha` | resolved 40-hex commit sha of the evaluated ref | optional | **required** |
| `refName` | non-empty string (e.g. `v0.1.0-rc.3`) | optional | **required** |
| `handoffArtifactSha` | 64-hex sha256 of the exact handoff file consumed, or `null` | optional | **required** |
| `handoffGeneratedByRef` | ref name of the harness build that GENERATED the referenced handoff artifact (e.g. `v0.1.0-rc.2`), or `null` | — | optional |
| `handoffGeneratedBySha` | 40-hex git commit sha of `handoffGeneratedByRef` (canonical; a 64-hex sha256 form of the generated artifact is also accepted), or `null` | — | optional |
| `handoff` | `{ path, chars, sha256 }` — chars = **package size (chars)** | required | required |
| `execution` | `{ invocation, exitCode, signal, timedOut, wallMs, stdoutLog, stderrLog }` | required | required |
| `commandsRun` | array of `{ cmd, purpose }` (filled by the observer, not guessed) | required | required |
| `edits` | `{ files, outOfScopeFiles, diffChars, diffPath }` | required | required |
| `verification` | `{ ran, commands, passed, details }` | required | required |
| `metrics` | the audit line 145 set, below | required | required |
| `notes` | free text — failures and anything surprising | required | required |

**Condition invariants (v2, enforced by `validateResultV2` since the
2026-09-09 re-audit):** the condition, the provenance and the handoff block
must agree — contradictory or half-filled provenance is rejected, not merely
incomplete:

- `condition === "baseline"` ⇒ `sourceHarness` **null**, `handoffArtifactSha`
  **null**, and `handoff.path`/`handoff.chars`/`handoff.sha256` all **null**
  (a baseline has no driver session and no artifact).
- `condition === "handoff"` ⇒ `sourceHarness` **non-null** (the driver
  harness), `handoffArtifactSha` **present** (64-hex), `handoff.path`
  **present**, `handoff.chars` **present** (measured size),
  `handoff.sha256` **present** (64-hex), and `handoff.sha256 ===
  handoffArtifactSha`. `verify-evidence` additionally hashes the referenced
  artifact file and rejects a mismatch with the recorded hash.
- `status: "not-run"` ⇒ `notRunReason` **non-empty** (why the leg did not
  run, e.g. provider-blocked with probe evidence).
- `condition === "baseline"` ⇒ `handoffGeneratedByRef`/`handoffGeneratedBySha`
  **null** (a baseline consumes no handoff artifact, so there is no generating
  ref to name). A `handoff`-condition record may leave them `null` only when
  the generating ref equals the evaluated candidate or is genuinely unknown.

**Handoff-generation provenance (`handoffGeneratedByRef` /
`handoffGeneratedBySha`, 2026-09-09 re-audit P2):** identifies **which ref
GENERATED a handoff artifact** when that ref differs from the evaluated
candidate — e.g. an artifact rendered by Harnie `v0.1.0-rc.2` and consumed by
an `rc.5`-bound leg records `handoffGeneratedByRef: "v0.1.0-rc.2"` plus the
rc.2 manifest's resolved `tagSha`. Fill both from the generating run's
manifest (`refName` + `tagSha`); when the generating ref is genuinely
unresolvable, set both explicitly to `null` and record the reason in `notes`.

**Paired + resolved + pinned (2026-09-09 re-audit P2 closure, enforced by
`validateResultV2` and `verify-evidence`):** the fields are no longer merely
syntax-checked.

- **Paired:** the two fields must be both null/absent or both present — a
  half-filled provenance pair is rejected.
- **Resolved:** for a 40-hex `handoffGeneratedBySha`, `verify-evidence`
  re-resolves `handoffGeneratedByRef` via git
  (`git rev-parse "<ref>^{commit}"`, against the repo the harness lives in or
  the `--repo` override) and the peeled commit must equal the recorded sha —
  an unrelated valid-looking sha is rejected. A 64-hex sha256 form (of the
  generated artifact bytes) cannot be re-resolved against git and only carries
  a warning. An **unresolvable** ref is an **error for release-qualifying
  records** and a **warning** otherwise (never a silent pass).
- **Pinned for release-qualifying runs:** a **release-qualifying** record
  (schema v2, `status: "ran"`, `condition: "handoff"`) requires
  `handoffGeneratedBySha === tagSha` — the consumed artifact must have been
  generated by the evaluated candidate itself. **Older artifacts are allowed
  only for non-qualifying records** (status `not-run`/`manual`, condition
  `baseline`, or archived v1). A leg whose artifact was rendered by an older
  build cannot be registered as release-qualifying at all: it must either be
  re-run with an artifact rendered at the candidate, or recorded `not-run`
  with its reason (the record's own `status`/`condition`/`schema` fields ARE
  the explicit non-qualifying marker — no extra schema field is added, so no
  second source of truth can contradict `status`).

**Run-manifest validation (`validateRunV2`, 2026-09-09 re-audit P2 closure):**
the v2 manifest is the anchor of the exact-candidate-binding and chronology
checks, so a manifest missing or emptying a mandatory field would let a
tampered record pass by leaving nothing to compare against. Every mandatory
field must be present and non-empty: `repo` (a repo NAME, never an absolute
path), `ref` (equal to `tagSha` in v2), `refName`, `tagSha` (40-hex commit
sha), `createdAt` (ISO timestamp), `node`, `platform`, and a non-empty
`tasks` array whose entries are registered task ids. Missing, null, empty or
wrong-typed mandatory fields are verification errors.

**Exact candidate binding (2026-09-09 re-audit P2, enforced by
`verify-evidence`):** every result record must describe the candidate its run
dir sits under — no half-bound provenance.

- Per record: `tagSha`, `refName`, and — for v2 records **required, non-null,
  40-hex** — `environment.ref` must **EQUAL** the run manifest's (`run.json`)
  values. Any mismatch is an error; a v2 record with a missing, null or
  non-40-hex `environment.ref` is an error (archived v1 records keep the soft
  when-both-present check).
- Per run manifest: when `refName` is **immutable** (a tag name or a 40-hex
  commit sha), `verify-evidence` re-resolves it in git
  (`git rev-parse <refName>^{commit}`) against a repository — default: the
  repo the harness lives in (equivalent to running with cwd = repo root);
  override with `--repo <git dir>` (used by tests with a throwaway repo) —
  and the peeled commit must equal `tagSha`; a disagreement is an error. A
  40-hex `refName` must equal `tagSha` directly.
- **Unresolvable or mutable refs** (missing tags, `HEAD`, branches, short
  shas) must produce a **warning** on stderr — never a silent pass, never a
  false failure. Warnings do not fail the check by themselves.
- Additionally, the run's committed `summary.json` is regenerated from the
  committed records via the harness's single summary-generation code path and
  compared **structurally** with the committed file, and the committed
  `summary.md` is compared **byte for byte** with the regenerated Markdown;
  any difference in either output is a **summary drift error** (`--fix`
  rewrites BOTH `summary.{md,json}` from the committed records). The byte
  comparison closes the 2026-09-09 re-audit P2 bypass where a hand-edited
  `summary.md` (e.g. an appended "FULL MATRIX PASS") passed while only
  `summary.json` was checked. This catches hand-edited records whose curated
  summary was not regenerated, stale summaries after record corrections, and
  tampered summary prose.

**Documentation consistency rules (2026-09-09 re-audit P2, enforced by
`tests/eval-docs-consistency.test.ts` AND — since the post-rc.6 re-audit
remediation — by `verify-evidence` itself, so the subcommand alone enforces
what the repository test checks):**

- No documentation file (`docs/internal/**/*.md`, `docs/research/**/*.md`,
  `README.md`) may reference a corrected-away eval directory name (e.g. the
  pre-rename future-dated name of the `eval-2026-09-09b` dir — cite the
  corrected name, never the abandoned one); raw evidence files (logs, probes,
  driver fixtures) are exempt — they are never rewritten and may quote machine
  paths as content.
- For every `docs/research/eval-*/README.md`, every run manifest's
  `createdAt` **UTC date** must appear among the dates claimed in that
  directory's README — a manifest describing a day the README does not claim
  is a documentation/manifest disagreement (fails).
- Every `docs/research/eval-*/runs/*/run.json` `createdAt` must not be in the
  future relative to the newest file mtime in the same run dir (1h tolerance,
  matching the chronology rule above) — future-dated manifests fail.
- `status: "ran"` ⇒ `execution.invocation` non-empty array,
  `execution.stdoutLog`/`stderrLog` non-empty, `execution.wallMs` a number,
  and an exit code (number) or an honest kill marker (`timedOut: true` /
  `signal`).
- Nested fields: every field the table documents must be **present** with the
  documented type (`null` allowed where unknown — a missing key or a
  wrong-typed value fails validation). `environment.agent` must be a
  non-empty string; `edits.files`, `edits.outOfScopeFiles`,
  `verification.commands` and `commandsRun` must be arrays.

**Path convention in records (v2, 2026-09-09):** every file reference
(`stdoutLog`, `stderrLog`, `edits.diffPath`, `handoff.path`, `patch.path`) is a
path **relative to the directory containing `result.json`**; `environment.clonePath`
is prefixed `disposable:` and is relative to the run dir (clones live only in
the disposable tmp store); `run.json`'s `repo` records the repo directory
**name**, never a machine-local absolute path; `execution.invocation[0]` records
the binary name, not its absolute path. Raw receiver logs are evidence and are
never rewritten, so quoted machine paths inside log/prompt **content** are
acceptable; the path fields themselves must be portable. `verify-evidence`
enforces all of this.

**Chronology rules (2026-09-09 re-audit, mandatory):** the harness EMITS every
timestamp (`run.json` `createdAt`, `recordedAt`) from the live clock at run
time. What the checks detect is inconsistent or future-dated timestamps. The
guarantee, stated exactly (and tested verbatim by
`tests/eval-docs-consistency.test.ts`):

> chronology verification detects inconsistent or future-dated timestamps; it cannot prove historical execution time against coordinated backdating without an external attestation.

(A fully coordinated backdate — manifest, records, run id and README edited
together on a fresh checkout whose mtimes reset — is self-consistent and
would pass; only an external, execution-time attestation can rule that out.)

- A record's `recordedAt` must sit within **±1h** of its run manifest's
  `createdAt` (records are written during the run; a value hours after the
  manifest, or before it, means the date was filled by hand).
- `recordedAt` (and `run.createdAt`) must be no more than **1h after** the
  newest file mtime inside the curated run dir. (mtimes on a fresh checkout
  are checkout-time — always later than the run — so only a timestamp claiming
  to be *longer than 1h after every file's actual last write* trips this;
  that is exactly the fabricated-date case.)
- **runId/createdAt binding (2026-09-09 re-audit P2 closure):** the runId must
  encode the execution timestamp in the canonical form
  `eval-<YYYYMMDD>T<HHMM>[SS][-suffix]` (UTC — the harness default derives the
  id from `new Date().toISOString()`), and the encoded stamp must agree with
  the manifest's `createdAt` within **±10 min, checked in both directions**.
  A runId without a parseable stamp, or a manifest whose `createdAt` disagrees
  with the id's stamp, is a verification error — a backdated manifest under an
  honestly-stamped run id fails.
- **Future-dating rejected at verification time (same closure):** a manifest's
  `createdAt` must be `<= verifier clock + 10 min` — a manifest dated in the
  future relative to the live clock at verification time fails, even when
  every other timestamp agrees with it.
- **README/manifest date agreement enforced by `verify-evidence` (same
  closure):** every curated dir's `README.md` must claim each run manifest's
  `createdAt` UTC date; the subcommand alone now enforces what
  `tests/eval-docs-consistency.test.ts` checks.
- **Execution-time attestation (`--attest`, 2026-09-09 re-audit P2, minimal):**
  `run --attest <string>` records the provided attestation string — plus the
  GitHub Actions environment (`GITHUB_RUN_ID`/`GITHUB_REPOSITORY`/
  `GITHUB_ACTOR`) when present — into the manifest's `attestation` block ONCE
  at manifest-creation time. `verify-evidence` requires a recorded block to be
  complete (non-empty `source`/`attestation`, ISO `capturedAt` within ±10 min
  of the manifest `createdAt`; `source: "github-actions"` also requires
  `githubRunId`). This is **self-recorded** provenance captured at execution
  time — it is **not** a cryptographic attestation and does not change the
  narrowed guarantee above; it only lets a CI-hosted run carry its run id
  forward so a discrepancy between the claimed CI provenance and the manifest
  is detectable.
- `verify-evidence` enforces all of these checks and fails the dir on any
  violation.
- **Synthetic driver/fixture session timestamps are fixture data, not
  execution times.** Driver files may carry fictional session stamps (e.g.
  the synthetic codex rollout in `eval-2026-09-09b/driver/`); every eval
  README must label its drivers as synthetic and state the real execution
  chronology (file mtimes + run manifests) separately.

Run manifest schema: `harnie-eval-run/v2` (same shape as v1; `repo` is now the
repo name instead of an absolute path — the evaluated commit is identified by
`refName` + `tagSha`; validated by `validateRunV2` above). The per-run
`summary.json` schema (`harnie-eval-summary/v1`) is unchanged — no shape
change, no bump.

`metrics` enums (honest defaults are `unknown`/`null`):

- `developerReExplanation`: `none|partial|full|not-needed|unknown`
- `repeatedInvestigation`: `none|partial|full|unknown`
- `repeatedFinishedEdits`: `none|yes|unknown` — repeated **finished** edits
- `nextActionCorrect`: `yes|no|partial|unknown`
- `missingOrFalseContext`: `none|missing|false|both|none-needed|unknown`
- `taskCompleted`: `true|false|null`
- `falseCompletion`: `true|false|null` — receiver claimed completion without evidence
- `packageSizeChars`: number|null

### Productivity qualification study (`productivity-v1`)

The completed preview matrix was designed primarily for continuation safety;
its fully specified prompts often make developer clarification unnecessary in
both conditions. It is therefore retrospective/exploratory evidence and
cannot establish a claim of “substantially less developer re-explanation.”
Wall-clock time and receiver command counts are secondary operational
measurements, not substitutes for that human endpoint.

Future confirmatory runs MUST be enrolled when their manifest is first created:

```sh
node scripts/eval-continuation.mjs run ... --study productivity-v1
```

Adding a study name to an existing run is rejected. Historical manifests that
lack `study: "productivity-v1"` are reported by the aggregator but excluded
from the confirmatory result. For each pair, hold task, candidate SHA, target
harness, model, limits and verification fixed; use fresh clones; alternate the
handoff/baseline run order across pairs. A human evaluator records only
developer-authored clarification supplied after the same initial continuation
request in each condition:

- `none`: no developer clarification was supplied.
- `partial`: one clarification supplied only part of the prior state needed by
  the receiver.
- `full`: the developer had to restate the prior goal, decisions, completed
  work or next action, or had to clarify more than once.
- `not-needed`: the task completed without an opportunity to measure the
  endpoint. This is honest evidence but is **not scored** as `none`.
- `unknown`: the evaluator could not determine the category; also not scored.

Predeclared qualification threshold (implemented by
`aggregateProductivity` / `qualify-productivity`):

1. At least **10 eligible paired trials**, spanning at least **3 tasks** and
   **2 target harnesses**, with at least **3 pairs per included target**.
2. Every enrolled pair has both conditions, verified completion, no false
   completion, no repeated finished edits and no out-of-scope edits. Failed or
   missing conditions remain in the denominator and fail this requirement.
3. Every eligible pair has a scorable `none|partial|full` rating in both
   conditions.
4. The handoff condition improves the explanation category in at least
   **70%** of pairs, worsens it in no more than **10%**, and the median paired
   change is at least **one category lower** (`handoff − baseline <= -1`).

The thresholds are conjunctive. Until all four hold, the verdict is
`NOT_ESTABLISHED`; no productivity-saving claim may be made. Repeated
investigation and median paired wall-time change are reported as secondary
measurements. Wall time remains explicitly exploratory because provider and
machine variance can dominate small coding tasks.

Aggregate one curated directory or the entire research tree:

```sh
node scripts/eval-continuation.mjs qualify-productivity --dir docs/research
```

**Initial preview gate** (per audit line 145): for the selected benchmark tasks, PASS requires `falseCompletion !== true` and `repeatedFinishedEdits !== "yes"` in every condition, with verification passing. `summarize` prints this per task with explicit FAIL reasons; failures and environment details are always reported, not just a GO label. `unknown`/`null` human metrics still require review before any gate claim.

**Verdict rules (two-verdict framing, mandatory since the 2026-09-09 re-audit):**
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
