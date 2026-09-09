# Release notes — harnie 0.1.0-rc.6 (developer preview)

Date: 2026-09-09. RC6 = RC5 (`docs/internal/RELEASE-0.1.0-rc.5.md`) plus this
docs-integrity round. This file is written to be accurate at pack time and
after publishing alike: it records no publication state and no publish-time
facts (tag → commit, run IDs, tarball SHA-256) — those live on `main` in
`docs/internal/LAUNCH-CHECKLIST.md` (Order 6) once they exist. The
"Release verification" section below tells you how to check any given
release yourself.

## What this preview does

**"Import supported local coding sessions, inspect evidence-backed work history, and prepare Markdown continuation packages."**

Harnie is a local-first work-state layer for coding agents. It reads Pi,
OpenCode, and Codex sessions without mutating them, stores observed work in
SQLite at `$HARNIE_HOME/harnie.db`, and emits evidence-backed Markdown
continuation handoffs. It does not resume sessions natively, does not accept
every session format, and makes no productivity-saving claims.

## Supported

Detail and per-claim evidence live in `docs/internal/SUPPORT-MATRIX.md`
(source of truth). Essentials (carried over from RC5): fixture/live imports
for pi/opencode (codex experimental), `sessions` discovery, `import --work`
attach, inspection (`list`/`show`/`executions`/`history`/`diff`) with the
opt-in `--json` machine contract (`docs/internal/MACHINE-CONTRACT.md`),
checkpoint/fork/handoff (bounded Markdown packages, `0600` artifacts),
ingestion + output redaction (best-effort), `backup`/`restore`.

## New in RC6 (post-rc.5 re-audit remediation: documentation integrity)

RC5 fixed the class of packaged-lifecycle problems; RC6 closes the remaining
documentation-integrity gaps found in the re-audit:

- **Lifecycle-neutral capability matrix.** `docs/internal/SUPPORT-MATRIX.md`
  now carries capabilities, evidence (test files + `docs/research/` paths),
  and limitations only — no assertions about which release is newest or
  forthcoming, no chronology of publication. Where a cited evaluation is
  bound to an exact tree, the binding is cited from the evidence itself
  (evaluations bound per-`tagSha`; see `docs/research/*/README.md`), not
  from a status sentence.
- **Expanded packaged-docs lifecycle ban.** `scripts/smoke-package.mjs`
  (part of `npm run check`) now rejects nine case-insensitive
  lifecycle-status phrase families in any file shipped in the tarball's
  `docs/`: newest/forthcoming-release assertions, run identifiers,
  tarball-attachment facts, and pending/unfinished publish states — so a
  tarball cannot ship describing its own release as mid-flight.
- **Chronology corrections in the historical notes.** The rc.3/rc.4/rc.5
  release notes dated some evaluation runs and probes to 2026-09-10; the
  verified chronology is that those runs executed 2026-09-09
  (~01:41–01:46Z, before the rc.4 publish) and are recorded in
  `docs/research/eval-2026-09-09b/`, and the pi re-probes of 13:54Z are
  recorded in `docs/research/eval-2026-09-09c/`. All three notes are
  corrected consistently on `main`.
- **Evaluation-integrity tooling.** `verify-evidence` now enforces
  candidate binding (records must bind to a tag/commit recorded in the
  evidence directory), and handoff provenance records a
  `handoffGeneratedBy` field.
- **Docs-consistency test.** A suite test now cross-checks the curated
  evaluation directories against the docs that cite them: no doc may
  reference the corrected-away name of the renamed evaluation directory,
  each evaluation directory's README must claim the `createdAt` date of
  every run manifest it describes, and no run manifest may be future-dated
  relative to the files it sits with. It does not guard figures such as
  test counts.
- **rc.5 publish facts recorded on `main`.** The Order 6 entry in
  `docs/internal/LAUNCH-CHECKLIST.md` carries the rc.5 verification facts
  (tag → commit, run IDs, tarball size and SHA-256, prerelease mark,
  verification date) — deliberately on `main`, not in any packaged file.
- **Packaging simplification.** Only the release note for this version
  ships in the tarball; the historical rc.1–rc.5 notes stay in the
  repository (corrected for chronology) but are no longer packaged.

## Release waiver

Release waiver: v0.1.0-rc.6 ships as a developer preview under an explicit
waiver of the full continuation-matrix gate (Verdict B). The safety sub-gate
(Verdict A) PASS is required and holds. The matrix legs OpenCode→Pi
baseline/trials and Codex→Pi remain not-run pending a funded Pi provider;
this release makes no claim that the full cross-harness matrix or the
productivity thesis is proven.

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
  and on 2026-09-09 (~01:41–01:46Z, before the rc.4 publish; recorded in
  `docs/research/eval-2026-09-09b/`) with driver context matching the
  benchmark task, handoff + baseline PASS, rc.3), but the 2026-09-09
  Codex→OpenCode handoff context was unrelated to its benchmark task and does
  not demonstrate semantic continuation; Codex→Pi remains provider-blocked.
- **Evaluation caveats (standing).** pi/opencode drivers are synthetic
  (real sessions are trivial to attach and remain a trivial step away);
  n=1 per successful leg; do not quote performance numbers beyond
  `docs/research/eval-2026-09-09/`, `docs/research/eval-2026-09-09b/`, and
  `docs/research/eval-2026-09-09c/`.
- **Unverified matrix legs (Verdict B PARTIAL).** The OpenCode→Pi
  baseline and requested extra trials, and the entire Codex→Pi leg, are
  NOT RUN — the pi receiver is provider-unfunded (paid openrouter credits
  exhausted / contested 429 free-tier daily quota; probes recorded
  2026-09-09T13:54Z, `docs/research/eval-2026-09-09c/`). This is not a code
  or harness problem: handoff artifacts are ready and sha-pinned, and the
  legs can execute unchanged once a funded pi model exists. See the release
  waiver above.

## Evaluation result (Order 5, two-verdict)

**Verdict A — safety among completed runs: PASS** (2026-09-09: 7 runs, rc.2;
2026-09-09 ~01:41–01:46Z: 2 runs, rc.3, `docs/research/eval-2026-09-09b/`):
no false completion, no repeated finished edits, no out-of-scope edits
across all completed receiver runs; every completion claim corroborated by
diff + evaluator re-verification; all provider-failure attempts honestly
recorded.

**Verdict B — full Order 5 matrix gate: PARTIAL/INCONCLUSIVE.** Met: the
Pi→OpenCode pair (09-09, handoff+baseline), the OpenCode→Pi handoff
(09-09, n=1, no paired baseline), Codex→OpenCode
transport/receiver-compatibility legs (09-09; plus the 2026-09-09 rc.3
first-run-recovery pair with task-matching driver context,
`docs/research/eval-2026-09-09b/`), and the
continuation-semantics OpenCode→Codex greeting-command leg (09-09;
driver steps 1–2 → receiver step 3 only). Not met / not run: the
OpenCode→Pi baseline + extra trials and the whole Codex→Pi leg —
provider-blocked (402 credits / 429 free tier; probes recorded
2026-09-09T13:54Z, `docs/research/eval-2026-09-09c/`).
Do not claim the matrix is met. Full verdicts, ledgers, and per-run
provenance: `docs/research/eval-2026-09-09/`,
`docs/research/eval-2026-09-09b/`, and `docs/research/eval-2026-09-09c/`
(prior: `eval-2026-09-08/` receiver compatibility, `eval-2026-09-07/`
initial gate).

## Recovery instructions

See `docs/internal/BACKUP-RECOVERY.md`. Short version: back up
`$HARNIE_HOME/harnie.db` via `harnie backup <path>` (consistent, atomically
written `0600` snapshot); restore with `harnie restore <path>` (validates
before touching the live store; `--force` to overwrite a newer store). There
is no undo. `handoffs/` artifacts are regenerable and excluded from backups.

## Install and verify

Requires Node.js **22.23 or newer in the Node 22 release line** (22.23.0 in
this project's automated checks). The package stays `private: true` — it is
**not published to npm**; distribution is via `npm pack` tarballs (and the
tarball attached to the GitHub Release by
`.github/workflows/release.yml`).

```sh
npm ci
npm pack
npm install --global ./harnie-*.tgz
```

Verify (never point the walkthrough at your real `~/.harnie`):

```sh
export HARNIE_HOME="$(mktemp -d)"
harnie --version            # 0.1.0-rc.6
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

## Release verification

This file makes no claim about whether, when, or how any particular release
was published. To verify a release of this version yourself:

1. **Tag.** The tag `v0.1.0-rc.6` should exist on
   https://github.com/BoringInfraCo/Harnie and point at the commit the
   release was cut from. The Release workflow asserts that the pushed tag
   equals `v` + the package version (`0.1.0-rc.6`) before creating a
   release, re-runs `npm run check` as a final gate, and passes
   `--verify-tag` to `gh release create` so the release cannot be created
   against a mismatched tag.
2. **Checks.** The automated checks for the tagged commit should be green:
   the tag-triggered continuous-integration run (typecheck + tests +
   package smoke) and the Release workflow run. Check the Actions tab for
   the runs associated with the tag.
3. **Tarball.** The GitHub Release for the tag should carry the tarball
   `harnie-0.1.0-rc.6.tgz` and a `harnie-0.1.0-rc.6.tgz.sha256` sidecar
   produced by the Release workflow. Download both, run
   `shasum -a 256 harnie-0.1.0-rc.6.tgz` (or `sha256sum`), and compare with
   the sidecar. A `-rc` tag's release should be marked as a prerelease
   (the workflow sets this automatically).
4. **Install.** In an empty directory, install the downloaded tarball (or a
   locally packed one) with
   `npm install --global ./harnie-0.1.0-rc.6.tgz`, then repeat the verify
   steps above with `HARNIE_HOME` pointed at a scratch directory:
   `harnie --version` prints `harnie 0.1.0-rc.6`; `harnie init --bogus` and
   `harnie backup x.db --bogus` exit 1; fixture import + handoff work.

For a given release, the publish-time facts observed during verification
(tag → commit, run IDs, tarball SHA-256) are recorded on `main` in
`docs/internal/LAUNCH-CHECKLIST.md` (Order 6) — deliberately not in this
packaged file, so nothing here goes stale at publish time.
