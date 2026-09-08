# Release notes — harnie 0.1.0-rc.1 (developer preview)

Date: 2026-09-08. Status: **released** — tagged `v0.1.0-rc.1`, pushed, and CI
green. This was the
named release candidate for the developer preview defined in
`docs/internal/LAUNCH-READINESS-AUDIT-2026-09-05.md` (Order 6).
Superseded by `docs/internal/RELEASE-0.1.0-rc.2.md` (re-audit remediation).

## What this preview does

**"Import supported local coding sessions, inspect evidence-backed work history, and prepare Markdown continuation packages."**

Harnie is a local-first work-state layer for coding agents. It reads Pi,
OpenCode, and Codex sessions without mutating them, stores observed work in
SQLite at `$HARNIE_HOME/harnie.db`, and emits evidence-backed Markdown
continuation handoffs. It does not resume sessions natively, does not accept
every session format, and makes no productivity-saving claims.

## Supported

Detail and per-claim evidence live in `docs/internal/SUPPORT-MATRIX.md`
(source of truth). Essentials:

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
- `handoff <work> --to opencode|pi` — Markdown continuation packages, saved
  under `$HARNIE_HOME/handoffs/`.
- Redaction at ingestion and output (best-effort, see limitations) and private
  file permissions (`0700` home, `0600` db/backups).
- `backup` / `restore` — consistent SQLite snapshots, validated restores.

## Experimental

- `import codex <path>` and `handoff --to codex` — **Codex is experimental
  because its receiver gate is not validated**: the adapter was validated
  against invented sanitized rollout JSONL, and no live Codex session has yet
  continued work from a Harnie handoff in a real Codex run. The 2026-09-07
  real-rollout import is a single manual datapoint, not a gate. The Order 5
  evaluation exercised only the OpenCode receiver
  (`docs/research/eval-2026-09-07/README.md`), so pi and codex receivers
  remain unexercised end-to-end.

## Known limitations

- **Redaction is best-effort, not a guarantee.** Only obvious secret-like
  patterns are caught at ingestion; anything missed is persisted. Legacy
  caveat: stores imported before ingestion redaction existed keep raw values
  in SQLite — the output backstop redacts display/handoff text only and never
  rewrites the database.
- **Single-writer preview.** Concurrent writers and snapshot atomicity are
  untested (`docs/internal/SUPPORT-MATRIX.md`); do not run parallel `harnie`
  commands against one home.
- **Checkpoint handoffs are frozen projections with event/execution
  watermarks**, not live views; verification state is a rule-derived claim,
  not a guarantee the receiver's verification actually covers current state.
- **Unexercised pi/codex receivers.** The continuation evaluation covered the
  OpenCode receiver only; codex/pi non-interactive flags were verified
  statically, not live.
- **Variance unmeasured.** The evaluation is a single run per condition
  (4 tasks × {handoff, baseline}); timing/quality variance across runs and
  models is unmeasured. Do not quote performance numbers beyond
  `docs/research/eval-2026-09-07/`.

## Evaluation result (Order 5, initial preview gate)

**PASS** on all four benchmark tasks (version-flag, shebang-guard,
first-run-recovery, help-regression-test), both conditions: no false
completion, no repeated finished edits, no out-of-scope edits; verification
independently re-run by the evaluator in every clone. Handoff condition was
faster with less exploration in 4/4 pairs. Limits: synthetic driver sessions,
single receiver/model (`opencode` 1.18.29, `opencode-go/kimi-k2.7-code`),
pi/codex receivers not exercised.

Raw evidence: `docs/research/eval-2026-09-07/` — `summary.md`/`summary.json`,
8 registered `result.json`s + raw logs/diffs under
`runs/eval-20260907T2041/`, full report in that directory's `README.md`.

## Recovery instructions

See `docs/internal/BACKUP-RECOVERY.md`. Short version: back up
`$HARNIE_HOME/harnie.db` via `harnie backup <path>` (consistent `VACUUM INTO`
snapshot, written `0600`); restore with `harnie restore <path>` (validates
before touching the live store; `--force` to overwrite a newer store). There
is no undo. `handoffs/` artifacts are regenerable and excluded from backups.

## Install and verify

Requires Node.js **22.23 or newer in the Node 22 release line** (CI runs
22.23.0). The package stays `private: true` — it is **not published to npm**;
the developer preview distributes via `npm pack` tarballs from this checkout
so the installed artifact is exactly the reviewed build and nothing is
publicly consumable before the release gates pass.

```sh
npm ci
npm pack
npm install --global ./harnie-0.1.0-rc.1.tgz
```

Verify (never point the walkthrough at your real `~/.harnie`):

```sh
export HARNIE_HOME="$(mktemp -d)"
harnie --help
harnie init
harnie import pi tests/fixtures/pi/coding.jsonl   # work:pi:cfef1a72-... , 13 events
harnie handoff work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8 --to opencode
```

The handoff prints to stdout and is saved under
`$HARNIE_HOME/handoffs/work_pi_cfef1a72-fb89-43a3-bac0-6c7246eda6d8.md`.
Automated equivalent: `npm run check` (typecheck + tests + offline package
smoke test, also enforced by `.github/workflows/ci.yml` on Node 22.23.0).
Verified 2026-09-08: `npm pack` → install tarball into an empty directory →
`--help` / `init` / fixture import / `handoff` all green against an isolated
`HARNIE_HOME`.

## Tag history

Tagged `v0.1.0-rc.1`, pushed, and CI green on 2026-09-08. Re-audit
remediation landed afterwards and is covered by
`docs/internal/RELEASE-0.1.0-rc.2.md`.
