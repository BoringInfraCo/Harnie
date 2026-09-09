# Harnie Launch Checklist

Date: 2026-09-08. Maps the audit's Orders 1–6
(`docs/internal/LAUNCH-READINESS-AUDIT-2026-09-05.md`, "Recommended launch
sequence and acceptance gates") to current status. Strict rule: a box is
checked only with cited evidence. Final gate `npm run check` was re-run green
on the `0.1.0-rc.4` tree on 2026-09-10 (typecheck clean, 63 test files /
396 tests passed, package smoke passed on v22.23.0 including strict-flag
(help-mode parse-before-help) and `--version` repros); the suite-green
caveats below describe the state at the time each order was closed,
superseded by that run.

Current capability detail lives in `docs/internal/SUPPORT-MATRIX.md`.

- [x] **Order 1 — Repair distribution and reproduced continuity/migration bugs.**
  Gate: installed CLI works; regressions for Findings 2–6 pass; existing suite green.
  Evidence: `tests/finding-2-regression.test.ts`,
  `tests/finding-3-regression.test.ts`, `tests/finding-4-regression.test.ts`,
  `tests/finding-5-regression.test.ts`, `tests/finding-6-regression.test.ts`,
  plus `tests/continuity-state.test.ts`, `tests/derive-persist.test.ts`,
  `tests/operations-persist.test.ts`; install path covered by
  `scripts/smoke-package.mjs` via `npm run test:package`. Manual 2026-09-07:
  built CLI (`npm run build` clean) imports pi/opencode/codex fixtures,
  attaches, checkpoints, forks, and renders all three handoff targets in an
  isolated `HARNIE_HOME` (see SUPPORT-MATRIX.md).
  How to verify: `npm run check`.
- [x] **Order 2 — Protect retained/output data and harden storage upgrades.**
  Gate: fake secrets redacted with traceability; supported legacy stores
  upgrade without loss; backup/restore verified.
  Evidence: `tests/redaction-ingest.test.ts`, `tests/redaction-output.test.ts`,
  `tests/store-permissions.test.ts` (redaction + traceability + modes);
  `tests/store-migration-hardening.test.ts` (legacy upgrade);
  `tests/cli-backup-restore.test.ts` (round-trip). Manual 2026-09-07: secrets
  fixture imports redacted with `secret_redacted` diagnostic and zero raw
  spans in `show`/handoff; backup → fresh-home restore round-trip verified.
  Post-rc.1 re-audit remediation (this round): create-time handoff artifact
  permissions (`0600` file, `0700` dir; `tests/cli-handoff-permissions.test.ts`)
  and JSON redaction covering the `show --json` output pass with true
  `redactions` counts (`tests/cli-json-redaction.test.ts`); checkpoint/fork/
  backup writes made atomic (`tests/fix-checkpoint-atomicity.test.ts`,
  `tests/fix-fork-atomicity.test.ts`, `tests/fix-backup-atomicity.test.ts`).
  How to verify: `npm run check` (covers all of the above), plus
  `HARNIE_HOME="$(mktemp -d)" node dist/cli.js backup <path>` /
  `restore <path> --force` spot-check.
  Caveat: redaction is best-effort with a legacy caveat (see
  SUPPORT-MATRIX.md), which is the accepted scope of this gate.
- [x] **Order 3 — Deliver a complete first-run journey and honest support matrix.**
  Gate: a new developer imports a fixture and their own supported session,
  finds the handoff, and continues it using the docs alone.
  Status 2026-09-08: done. Journey: `sessions` discovery + `import opencode
  <ses_id>` documented and verified in `docs/internal/FIRST-RUN.md` and
  README (both refreshed; install command version-agnostic `harnie-*.tgz`).
  Honesty: SUPPORT-MATRIX.md evidence-backed and refreshed for RC2 (machine
  contract and budgeted handoffs now listed as supported; permissions and
  JSON redaction rows updated). Package now carries the user docs
  (`FIRST-RUN`, `BACKUP-RECOVERY`, `MACHINE-CONTRACT`, `SUPPORT-MATRIX`,
  `RELEASE-0.1.0-rc.2`) and the example fixture
  `tests/fixtures/pi/coding.jsonl` (verified via `npm pack --dry-run`);
  internal strategy material is excluded.
  How to verify: follow `docs/internal/FIRST-RUN.md` on a clean checkout with
  a scratch `HARNIE_HOME`; confirm `harnie sessions`, fixture import, own-session
  import, `show`, `handoff`, and continuation-from-handoff with no other help;
  `npm pack --dry-run` shows the docs + fixture in the manifest.
- [x] **Order 4 — Add a minimal stable machine contract and bounded handoffs.**
  Gate: JSON schema/error tests, deterministic output and explicit truncation;
  text compatibility retained.
  Status: done. Opt-in schema-versioned `--json` with stable error codes on
  inspection/handoff commands (`src/contract/`,
  `docs/internal/MACHINE-CONTRACT.md`); total bounded-handoff size budget
  with explicit omitted counts. RC2: `show --json` redacts all free-text
  fields and reports true output-pass `redactions` counts; semantics
  documented in MACHINE-CONTRACT.md.
  Evidence: `tests/contract-json.test.ts`, `tests/contract-errors.test.ts`,
  `tests/handoff-bounds.test.ts`, `tests/cli-json-redaction.test.ts`; text
  compatibility retained (`tests/eval-harness.test.ts`, `tests/cli-init.test.ts`).
  How to verify: `node dist/cli.js <command> --json` output matches the
  envelope schema in MACHINE-CONTRACT.md; `npm run check`.
- [x] **Order 5 — Re-run continuation evaluation on the release candidate.**
  Gate: unrelated-repository tasks, bidirectional paths, baseline comparison,
  raw outcome evidence; no false completion or repeated completed edits in the
  benchmark tasks for the initial preview gate.
  Status: extended 2026-09-08, PASS (initial gate 2026-09-07
  `docs/research/eval-2026-09-07/`).
  Evidence: `docs/research/eval-2026-09-08/` — all three receivers exercised
  (pi 0.84.4 -p, codex 0.149.1 exec --sandbox workspace-write, opencode
  1.18.29 run --auto); bidirectional paths (--to pi→pi, --to codex driven by
  a real 248-event codex session, --to opencode ×4); unrelated-repo leg
  (scratch slugify-util); long-session leg (4 execs/52 events → 3100-char
  handoff, correct next action); repeats n=2; baseline-size reporting bug
  fixed (`tests/eval-harness.test.ts`).
  Caveats recorded honestly: real-session drivers codex-only, pi/codex
  baselines not run, n=1 per leg.
  How to verify: `node scripts/eval-continuation.mjs tasks --json`;
  inspect `docs/research/eval-2026-09-08/`.
- Order 5 — Directed cross-harness matrix (2026-09-09, ref v0.1.0-rc.2/0231dd7,
  plus funded rerun pass 2026-09-10 bound to v0.1.0-rc.3/cbe5399). Two-verdict
  framing per `docs/internal/EVALUATION-PROTOCOL.md` §4 (a PASS on Verdict A
  is not a PASS on Verdict B):

  - [ ] Verdict A (safety among completed runs): PASS — 09-09 (7 runs, rc.2) + 09-10 (2 runs, rc.3)
  - [ ] Verdict B (full Order 5 matrix gate): PARTIAL/INCONCLUSIVE — do NOT claim the matrix met
    - [ ] Pi → Harnie → OpenCode: met (09-09, rc.2; handoff+baseline verified)
    - [ ] OpenCode → Harnie → Pi: PARTIAL — handoff PASS n=1 (rc.2); baseline + trials NOT RUN (provider)
    - [ ] Codex → Harnie → Pi: NOT RUN — pi receiver provider-blocked (402 credits / 429 free tier; probes recorded 09-10)
    - [ ] Codex → Harnie → OpenCode: met for transport/receiver compatibility ONLY
      - 09-09 leg: handoff context unrelated to the benchmark task → no semantic-continuation claim
      - 09-10 leg D (rc.3, first-run-recovery, task-matching driver context): handoff + baseline PASS
    - [ ] Continuation semantics: met via OpenCode→Codex greeting-command leg (09-09; steps 1-2 → step 3 only)
  - [ ] Re-run gate: only pi funding (a funded openrouter key) blocks the remaining legs; artifacts are ready + sha-pinned in docs/research/eval-2026-09-{09,10}/driver/, records show not-run + reasons
  - [ ] Integrity: verify-evidence OK on docs/research/eval-2026-09-09 and eval-2026-09-10 (run after any new evidence)
- [x] **Order 6 — Tag and release a developer preview.**
  Gate: named release candidate, green automated checks, tested install
  instructions, known limitations, recovery instructions.
  Status 2026-09-09: **done — RC3 fully published and verified.** Tag
  `v0.1.0-rc.3` → commit `cbe5399346a27d43a13dc8856dfe54ff039936fe`
  (first push `83d40ed` failed CI, superseded by the git-identity fix
  `cbe5399`); CI green (run 34297508050), Release workflow green (run
  34297507940); GitHub release
  https://github.com/BoringInfraCo/Harnie/releases/tag/v0.1.0-rc.3 with
  asset `harnie-0.1.0-rc.3.tgz` (SHA-256
  `bebf9201d497a9b3b92c1e2e8a6246404ea2d8586e14b63ef80bc6c09d0407f9`),
  `isPrerelease` true; independently verified 2026-09-09 (clean install,
  `--version`, `init --bogus` exit 1, `backup x.db --bogus` exit 1,
  fixture import + handoff). RC2 published 2026-09-08 as above.
- [x] **Order 6 — `v0.1.0-rc.4` published 2026-09-09.** Tag `v0.1.0-rc.4` →
  commit `37c4c22`; CI green on main and the tag (runs 34302120421,
  34302121764); Release workflow green (run 34302121639); GitHub Release
  https://github.com/BoringInfraCo/Harnie/releases/tag/v0.1.0-rc.4 with
  asset `harnie-0.1.0-rc.4.tgz` (95.3 kB, SHA-256
  `d5a487b486007b7b5a29ca8e9fee254f513947218eef9454538142f323953851`),
  `isPrerelease` true; independently verified 2026-09-09 (published asset
  downloaded, clean install under temp `HARNIE_HOME`: `--version` →
  `0.1.0-rc.4`, `init --bogus` exit 1, `backup x.db --bogus` exit 1,
  fixture import + handoff). This checklist fact lives on `main` for the
  next RC (rc.4's immutable tarball still says "pending"; corrected here
  per the established pattern).
  How to verify: `npm run check` (numbers above),
  `npm run test:package`, install-instructions walkthrough on a clean machine,
  release tag + published GitHub Release.
