# Release notes — harnie 0.1.0-rc.2 (developer preview)

Date: 2026-09-08. Status: **published** (tag `v0.1.0-rc.2`, see
"Published artifact" at the bottom). RC2 = RC1
(`docs/internal/RELEASE-0.1.0-rc.1.md`) plus the post-rc.1 re-audit
remediation.

## What this preview does

**"Import supported local coding sessions, inspect evidence-backed work history, and prepare Markdown continuation packages."**

Harnie is a local-first work-state layer for coding agents. It reads Pi,
OpenCode, and Codex sessions without mutating them, stores observed work in
SQLite at `$HARNIE_HOME/harnie.db`, and emits evidence-backed Markdown
continuation handoffs. It does not resume sessions natively, does not accept
every session format, and makes no productivity-saving claims.

## Supported

Detail and per-claim evidence live in `docs/internal/SUPPORT-MATRIX.md`
(source of truth). Essentials (all carried over from RC1):

- `import pi <path>` — Pi v3/v4 session JSONL (committed sanitized fixtures
  verified; malformed lines skipped with diagnostics).
- `import opencode <path|session-id>` — Harnie snapshot JSON or a live
  `ses_...` id read read-only from the local OpenCode SQLite database.
- `sessions [--harness pi|opencode|codex]` — local session discovery with
  ready-to-run import commands.
- `import ... --work <id>` — attach a session as a new execution of existing
  Work; re-import is idempotent.
- Inspection: `list`, `show`, `executions`, `history`, `diff`; opt-in
  `--json` machine contract with stable error codes
  (`docs/internal/MACHINE-CONTRACT.md`).
- `checkpoint` / `fork` / `handoff --checkpoint` — frozen snapshot projections.
- `handoff <work> --to opencode|pi` — bounded Markdown continuation packages,
  saved under `$HARNIE_HOME/handoffs/` (`0600`, dir `0700`).
- Redaction at ingestion and output (best-effort, see limitations) and private
  file permissions (`0700` home, `0600` db/backups/artifacts).
- `backup` / `restore` — consistent, atomic SQLite snapshots, validated
  restores.

## New in RC2 (re-audit remediation)

- **P1 — handoff artifact permissions fixed at creation time.** Handoff
  artifacts are written `0600` and the `handoffs/` directory `0700` in the
  same write path; no longer dependent on a later store open to tighten.
  Evidence: `tests/cli-handoff-permissions.test.ts`.
- **P1 — JSON redaction leak closed.** `show --json` now redacts all
  free-text fields and reports the true output-pass redaction span count as
  `redactions` (builder-level markers in `derived` are idempotent and not
  double-counted). Evidence: `tests/cli-json-redaction.test.ts`;
  semantics documented in `docs/internal/MACHINE-CONTRACT.md`.
- **Atomic checkpoint / fork / backup writes** (write-to-temp + rename): a
  crash mid-write can no longer leave a torn snapshot. Evidence:
  `tests/fix-checkpoint-atomicity.test.ts`, `tests/fix-fork-atomicity.test.ts`,
  `tests/fix-backup-atomicity.test.ts`.
- **Evaluation harness reporting bug fixed and gate extended** (Order 5):
  baseline-size reporting corrected; all three receivers exercised live
  (pi 0.84.4 `-p`, codex 0.149.1 `exec --sandbox workspace-write`, opencode
  1.18.29 `run --auto`); bidirectional paths; real 248-event Codex driver
  session; unrelated-repo and long-session legs; repeats n=2. Evidence:
  `docs/research/eval-2026-09-08/`.
- **Docs/package consistency:** the tarball now carries the user-relevant
  docs (`FIRST-RUN`, `BACKUP-RECOVERY`, `MACHINE-CONTRACT`,
  `SUPPORT-MATRIX`, these release notes) and the example fixture
  `tests/fixtures/pi/coding.jsonl`; README/FIRST-RUN install commands are
  version-agnostic (`harnie-*.tgz`); support matrix refreshed (machine
  contract and budgeted handoffs are implemented, permissions and JSON
  redaction rows updated); release workflow `.github/workflows/release.yml`
  publishes a GitHub Release with the tarball on `v*` tag pushes.

## Known limitations

- **Redaction is best-effort, not a guarantee.** Only obvious secret-like
  patterns are caught at ingestion; anything missed is persisted. Legacy
  caveat: stores imported before ingestion redaction existed keep raw values
  in SQLite — the output backstop (now covering text and `--json` modes)
  redacts display/handoff text only and never rewrites the database.
- **Single-writer preview.** Concurrent multi-process writers are untested
  (snapshot writes are now atomic, but parallel `harnie` commands against one
  home are not supported — `docs/internal/SUPPORT-MATRIX.md`).
- **Checkpoint handoffs are frozen projections with event/execution
  watermarks**, not live views; verification state is a rule-derived claim,
  not a guarantee the receiver's verification actually covers current state.
- **Codex remains experimental.** The Codex receiver was exercised live in
  the 2026-09-08 evaluation, but real-session drivers are codex-only and the
  adapter's production-`~/.codex` coverage is still a single manual datapoint
  plus fixtures.
- **Evaluation caveats (remaining).** Real-session drivers codex-only; pi and
  codex baselines not run; n=1 per leg. Do not quote performance numbers
  beyond `docs/research/eval-2026-09-08/`.

## Evaluation result (Order 5, extended gate)

**PASS** (extended 2026-09-08): all three receivers exercised (pi 0.84.4 -p,
codex 0.149.1 exec --sandbox workspace-write, opencode 1.18.29 run --auto);
bidirectional paths (--to pi→pi, --to codex driven by a real 248-event codex
session, --to opencode ×4); unrelated-repo leg; long-session leg (4
executions/52 events → 3100-char handoff, correct next action); repeats n=2;
no false completion or repeated finished edits in any condition. Raw
evidence: `docs/research/eval-2026-09-08/` (prior gate:
`docs/research/eval-2026-09-07/`).

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
harnie --help
harnie init
harnie import pi tests/fixtures/pi/coding.jsonl   # work:pi:cfef1a72-... , 13 events
harnie handoff work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8 --to opencode
```

Automated equivalent: `npm run check` (typecheck + tests + offline package
smoke test), enforced by `.github/workflows/ci.yml` and re-run by
`.github/workflows/release.yml` on tag pushes.

## Published artifact

RC2 is fully published (2026-09-08):

- Tag `v0.1.0-rc.2` → commit `0231dd77ce909d04fcb60692ae48a47df04c9b68`.
- CI green: run 34245576389. Release workflow green: run 34245576530.
- GitHub release: https://github.com/BoringInfraCo/Harnie/releases/tag/v0.1.0-rc.2
  with asset `harnie-0.1.0-rc.2.tgz` (~90 kB).
- Verified by independent clean-prefix install on 2026-09-08.

Note: the release was published before the workflow marked prereleases
automatically; the orchestrator runs
`gh release edit v0.1.0-rc.2 --prerelease` to backfill the prerelease marker
(marked in `.github/workflows/release.yml` comments, not run by agents).
