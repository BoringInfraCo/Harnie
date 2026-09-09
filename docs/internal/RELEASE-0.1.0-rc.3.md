# Release notes — harnie 0.1.0-rc.3 (developer preview)

Date: 2026-09-09. Status: **prepared, pending tag** (`v0.1.0-rc.3`). RC3 =
RC2 (`docs/internal/RELEASE-0.1.0-rc.2.md`, published — tag `v0.1.0-rc.2` →
`0231dd77ce909d04fcb60692ae48a47df04c9b68`, release
https://github.com/BoringInfraCo/Harnie/releases/tag/v0.1.0-rc.2 with asset
`harnie-0.1.0-rc.2.tgz`, clean-prefix install verified 2026-09-08) plus this
post-rc.2 re-audit remediation round. The remaining release step is
documented at the bottom and in `docs/internal/LAUNCH-CHECKLIST.md` (Order 6).

## What this preview does

**"Import supported local coding sessions, inspect evidence-backed work history, and prepare Markdown continuation packages."**

Harnie is a local-first work-state layer for coding agents. It reads Pi,
OpenCode, and Codex sessions without mutating them, stores observed work in
SQLite at `$HARNIE_HOME/harnie.db`, and emits evidence-backed Markdown
continuation handoffs. It does not resume sessions natively, does not accept
every session format, and makes no productivity-saving claims.

## Supported

Detail and per-claim evidence live in `docs/internal/SUPPORT-MATRIX.md`
(source of truth). Essentials (carried over from RC2): fixture/live imports
for pi/opencode (codex experimental), `sessions` discovery, `import --work`
attach, inspection (`list`/`show`/`executions`/`history`/`diff`) with the
opt-in `--json` machine contract (`docs/internal/MACHINE-CONTRACT.md`),
checkpoint/fork/handoff (bounded Markdown packages, `0600` artifacts),
ingestion + output redaction (best-effort), `backup`/`restore`.

## New in RC3 (post-rc.2 re-audit remediation)

- **Strict flag parsing on all commands.** `init`, `backup` (and every other
  command) now reject unknown flags — the machine contract's strictness
  claim is now literally true end-to-end — and a top-level
  `--version`/`-V` prints the package version. Evidence:
  `tests/cli-strict-args.test.ts`, `tests/cli-version.test.ts`; packed
  smoke covers the re-audit repros (`scripts/smoke-package.mjs`).
- **Directed cross-harness matrix (Order 5, 2026-09-09, ref
  `v0.1.0-rc.2`/`0231dd7`).** Pi→Harnie→OpenCode PASS (handoff+baseline);
  Codex→Harnie→OpenCode PASS (handoff+baseline); OpenCode→Harnie→Pi handoff
  PASS n=1 (baseline NOT RUN — 5 recorded provider-failure attempts,
  openrouter 402/429); Codex→Harnie→Pi NOT RUN (same provider blocker,
  handoff artifact ready); continuation task (driver pre-commits steps 1–2,
  receiver completes step 3 only) PASS via OpenCode→Codex. Per-run
  provenance fields (`sourceHarness`/`targetHarness`/`tagSha`/
  `handoffArtifactSha`) added and validated; the 2026-09-08 evidence is
  reclassified as RECEIVER COMPATIBILITY. Gate "no false completion or
  repeated completed edits": PASS across all successful runs; all failures
  honestly recorded. Evidence: `docs/research/eval-2026-09-09/`
  (+ reclassification notes in `eval-2026-09-08/`).
- **Release metadata fixes.** `.github/workflows/release.yml` now verifies
  the tag against the pushed SHA (`--verify-tag`) and marks `-rc`/`-alpha`/
  `-beta` tags as prereleases at creation; the existing `v0.1.0-rc.2`
  release is flipped to prerelease by the orchestrator
  (`gh release edit v0.1.0-rc.2 --prerelease`, noted in the workflow
  comments). Docs status reconciled: RC2 marked published (Order 6 checked
  with tag SHA, CI/release run ids, release URL, asset, verification date),
  SUPPORT-MATRIX refreshed (strict flags, `--version`/`-V`, directed matrix,
  Codex receiver-gate datapoint).

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
  manual datapoint plus fixtures. The receiver side is stronger but
  partial: a Codex receiver consumed a Harnie handoff successfully in a
  live run on 2026-09-09 (OpenCode→Harnie→Codex continuation leg), and the
  2026-09-08 compatibility runs exercised `codex exec` live — but Codex as
  a source driver in the directed matrix remains blocked.
- **Evaluation caveats (remaining).** pi/opencode drivers are synthetic
  (real sessions are trivial to attach and remain a trivial step away);
  n=1 per successful leg; OpenCode→Pi baseline/trials 2–3 and the
  Codex→Harnie→Pi leg are **provider-blocked (openrouter credits/429) and
  rerunnable once funded** — handoff artifacts are ready. Do not quote
  performance numbers beyond `docs/research/eval-2026-09-09/`.

## Evaluation result (Order 5, directed matrix)

**PASS** (2026-09-09, ref `v0.1.0-rc.2`/`0231dd7`): no false completion or
repeated completed edits across all 7 successful receiver runs; every
completion claim corroborated by diff + evaluator re-verification; all
provider-failure attempts honestly recorded as failures. Full verdict,
trial ledger, and per-run provenance: `docs/research/eval-2026-09-09/`
(prior: `docs/research/eval-2026-09-08/` receiver compatibility,
`docs/research/eval-2026-09-07/` initial gate).

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
harnie --version            # 0.1.0-rc.3
harnie --help
harnie init
harnie init --bogus         # rejected: unknown flag
harnie import pi tests/fixtures/pi/coding.jsonl   # work:pi:cfef1a72-... , 13 events
harnie handoff work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8 --to opencode
```

Automated equivalent: `npm run check` (typecheck + tests + offline package
smoke test), enforced by `.github/workflows/ci.yml` and re-run by
`.github/workflows/release.yml` on tag pushes.

## What remains to publish

Release-engineering steps (orchestrator, user-executed — nothing is
committed, tagged, pushed, or run against the GitHub API by the release
prep): commit the working tree (strict flags + `--version`, eval
`eval-2026-09-09/`, docs + workflows + version bump), tag `v0.1.0-rc.3`,
push with tags — CI gates the tag and `.github/workflows/release.yml`
creates the GitHub Release with the tarball attached, prerelease-marked and
tag-verified. Confirm both workflows green and the asset present
(`docs/internal/LAUNCH-CHECKLIST.md`, Order 6).
