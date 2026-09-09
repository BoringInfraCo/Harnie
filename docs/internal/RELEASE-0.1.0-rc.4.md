# Release notes — harnie 0.1.0-rc.4 (developer preview)

Date: 2026-09-10. Status: **published** (`v0.1.0-rc.4`). RC4 =
RC3 (`docs/internal/RELEASE-0.1.0-rc.3.md`, published — tag `v0.1.0-rc.3` →
`cbe5399346a27d43a13dc8856dfe54ff039936fe`, release
https://github.com/BoringInfraCo/Harnie/releases/tag/v0.1.0-rc.3 with asset
`harnie-0.1.0-rc.3.tgz` (SHA-256
`bebf9201d497a9b3b92c1e2e8a6246404ea2d8586e14b63ef80bc6c09d0407f9`),
`isPrerelease` true, independently verified 2026-09-09) plus this
post-rc.3 re-audit remediation round. The remaining release step is
documented at the bottom and in `docs/internal/LAUNCH-CHECKLIST.md`
(Order 6).

## What this preview does

**"Import supported local coding sessions, inspect evidence-backed work history, and prepare Markdown continuation packages."**

Harnie is a local-first work-state layer for coding agents. It reads Pi,
OpenCode, and Codex sessions without mutating them, stores observed work in
SQLite at `$HARNIE_HOME/harnie.db`, and emits evidence-backed Markdown
continuation handoffs. It does not resume sessions natively, does not accept
every session format, and makes no productivity-saving claims.

## Supported

Detail and per-claim evidence live in `docs/internal/SUPPORT-MATRIX.md`
(source of truth). Essentials (carried over from RC3): fixture/live imports
for pi/opencode (codex experimental), `sessions` discovery, `import --work`
attach, inspection (`list`/`show`/`executions`/`history`/`diff`) with the
opt-in `--json` machine contract (`docs/internal/MACHINE-CONTRACT.md`),
checkpoint/fork/handoff (bounded Markdown packages, `0600` artifacts),
ingestion + output redaction (best-effort), `backup`/`restore`.

## New in RC4 (post-rc.3 re-audit remediation)

- **Parse-before-help strictness on all four help short-circuits.**
  `--help`/`-h` no longer bypass flag validation: help prints and exits 0
  only when the rest of the argv parses cleanly — an unknown or duplicate
  flag next to `--help` (e.g. `harnie backup --help --bogus`) is rejected
  with exit 1 exactly as in normal execution
  (`tests/cli-help-strict.test.ts`; spec: `docs/internal/MACHINE-CONTRACT.md`,
  "Flag hardening").
- **Evaluation record schema v2 with the v1 validator retained.** Eval
  result records stamp `harnie-eval-result/v2`; the retained v1 validator
  keeps older evidence readable. Evidence: `tests/eval-harness.test.ts`.
- **Two-verdict evaluation reporting** (per
  `docs/internal/EVALUATION-PROTOCOL.md` §4). Verdict A (safety behavior
  among completed runs) and Verdict B (full Order 5 matrix gate) are
  separate claims — a PASS on A is not a PASS on B. Current status:
  **Verdict A PASS / Verdict B PARTIAL**, with the not-run legs and their
  provider-funding reasons recorded explicitly
  (`docs/research/eval-2026-09-09/`, `docs/research/eval-2026-09-10/`).
  See the evaluation section below.
- **Portable evaluation evidence.** Per-run `run.json` and `summaries`,
  and relative paths throughout `docs/research/eval-*/`, so the evidence
  tree does not depend on absolute machine paths; a `verify-evidence`
  subcommand re-checks record/sha integrity of an evidence directory.
  Integrity is green on both `docs/research/eval-2026-09-09/` and
  `docs/research/eval-2026-09-10/`.
- **Release-doc status corrections.** RC3 docs reconciled with reality:
  rc.3 is fully published (tag, CI/release runs, release URL, asset +
  SHA-256, prerelease mark, independent verification), and the Codex rows
  use the precise wording (Codex→OpenCode executed successfully —
  transport/receiver compatibility; Codex→Pi remains provider-blocked; the
  09-09 Codex→OpenCode handoff context was unrelated to its benchmark task,
  so it does not demonstrate semantic continuation).

## Known limitations

- **Redaction is best-effort, not a guarantee.** Only obvious secret-like
  patterns are caught at ingestion; anything missed is persisted. Legacy
  caveat: stores imported before ingestion redaction existed keep raw values
  in SQLite — the output backstop (covering text and `--json` modes)
  redacts display/handoff text only and never rewrites the database.
- **Single-writer preview.** Concurrent multi-process writers are untested
  (snapshot writes are atomic, but parallel `harnie` commands against one
  home are not supported — `docs/internal/SUPPORT-MATRIX.md`).
- **Codex remains experimental.** Import-side live gate is still a single
  manual datapoint plus fixtures. The receiver side is stronger but partial:
  Codex→OpenCode executed successfully (transport/receiver compatibility —
  and on 2026-09-10 with driver context matching the benchmark task,
  handoff + baseline PASS, rc.3), but the 2026-09-09 Codex→OpenCode
  handoff context was unrelated to its benchmark task and does not
  demonstrate semantic continuation; Codex→Pi remains provider-blocked.
- **Evaluation caveats (standing).** pi/opencode drivers are synthetic
  (real sessions are trivial to attach and remain a trivial step away);
  n=1 per successful leg; do not quote performance numbers beyond
  `docs/research/eval-2026-09-09/` and `docs/research/eval-2026-09-10/`.
- **Unverified matrix legs (Verdict B PARTIAL).** The OpenCode→Pi
  baseline and requested extra trials, and the entire Codex→Pi leg, are
  NOT RUN — the pi receiver is provider-unfunded (paid openrouter credits
  exhausted / contested 429 free-tier daily quota; probes recorded
  2026-09-10). This is not a code or harness problem: handoff artifacts
  are ready and sha-pinned, and the legs can execute unchanged once a
  funded pi model exists.

## Evaluation result (Order 5, two-verdict)

**Verdict A — safety among completed runs: PASS** (09-09: 7 runs, rc.2;
09-10: 2 runs, rc.3): no false completion, no repeated finished edits, no
out-of-scope edits across all completed receiver runs; every completion
claim corroborated by diff + evaluator re-verification; all
provider-failure attempts honestly recorded.

**Verdict B — full Order 5 matrix gate: PARTIAL/INCONCLUSIVE.** Met: the
Pi→OpenCode pair (09-09, handoff+baseline), the OpenCode→Pi handoff
(09-09, n=1, no paired baseline), Codex→OpenCode
transport/receiver-compatibility legs (09-09; plus the 09-10 rc.3
first-run-recovery pair with task-matching driver context), and the
continuation-semantics OpenCode→Codex greeting-command leg (09-09;
driver steps 1–2 → receiver step 3 only). Not met / not run: the
OpenCode→Pi baseline + extra trials and the whole Codex→Pi leg —
provider-blocked (402 credits / 429 free tier; probes recorded 09-10).
Do not claim the matrix is met. Full verdicts, ledgers, and per-run
provenance: `docs/research/eval-2026-09-09/` and
`docs/research/eval-2026-09-10/` (prior: `eval-2026-09-08/` receiver
compatibility, `eval-2026-09-07/` initial gate).

## Recovery instructions

See `docs/internal/BACKUP-RECOVERY.md`. Short version: back up
`$HARNIE_HOME/harnie.db` via `harnie backup <path>` (consistent, atomically
written `0600` snapshot); restore with `harnie restore <path>` (validates
before touching the live store; `--force` to overwrite a newer store). There
is no undo. `handoffs/` artifacts are regenerable and excluded from backups.

## Install and verify

Requires Node.js **22.23 or newer in the Node 22 release line** (CI runs
22.23.0). The package stays `private: true` — it is **not published to npm**;
distribution is via `npm pack` tarballs (and the GitHub Release asset from
`.github/workflows/release.yml`).

```sh
npm ci
npm pack
npm install --global ./harnie-*.tgz
```

Verify (never point the walkthrough at your real `~/.harnie`):

```sh
export HARNIE_HOME="$(mktemp -d)"
harnie --version            # 0.1.0-rc.4
harnie --help
harnie init
harnie init --bogus         # rejected: unknown flag
harnie backup x.db --help --bogus   # rejected: unknown flag (parse-before-help)
harnie import pi tests/fixtures/pi/coding.jsonl   # work:pi:cfef1a72-... , 13 events
harnie handoff work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8 --to opencode
```

Automated equivalent: `npm run check` (typecheck + tests + offline package
smoke test), enforced by `.github/workflows/ci.yml` and re-run by
`.github/workflows/release.yml` on tag pushes.

## Published artifact

Tag `v0.1.0-rc.4` → commit `37c4c22` (main `37c4c22…`). CI green on main
and the tag (runs 34302120421, 34302121764); Release workflow green
(run 34302121639). GitHub Release
https://github.com/BoringInfraCo/Harnie/releases/tag/v0.1.0-rc.4 with
asset `harnie-0.1.0-rc.4.tgz` (95.3 kB, 68 files), SHA-256
`d5a487b486007b7b5a29ca8e9fee254f513947218eef9454538142f323953851`,
`isPrerelease` true (automatic for `-rc` tags). Independently verified
2026-09-09 by downloading the published asset and a clean-prefix install
under a temp `HARNIE_HOME`: `--version` → `harnie 0.1.0-rc.4`;
`init --bogus` / `backup x.db --bogus` exit 1; fixture import + handoff.
