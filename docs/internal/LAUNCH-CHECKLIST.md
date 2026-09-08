# Harnie Launch Checklist

Date: 2026-09-07. Maps the audit's Orders 1–6
(`docs/internal/LAUNCH-READINESS-AUDIT-2026-09-05.md`, "Recommended launch
sequence and acceptance gates") to current status. Strict rule: a box is
checked only with cited evidence. Final gate `npm run check` was re-run green
on the `0.1.0-rc.1` tree on 2026-09-08 (typecheck clean, 55 test files /
333 tests passed, package smoke passed on v22.23.0); the suite-green caveats
below describe the state at the time each order was closed, superseded by
that run.

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
  Caveat: suite-green was not re-run in this pass (final gate does that); the
  audit's "191 tests" count predates uncommitted `sessions` work — do not quote it.
- [x] **Order 2 — Protect retained/output data and harden storage upgrades.**
  Gate: fake secrets redacted with traceability; supported legacy stores
  upgrade without loss; backup/restore verified.
  Evidence: `tests/redaction-ingest.test.ts`, `tests/redaction-output.test.ts`,
  `tests/store-permissions.test.ts` (redaction + traceability + modes);
  `tests/store-migration-hardening.test.ts` (legacy upgrade);
  `tests/cli-backup-restore.test.ts` (round-trip). Manual 2026-09-07: secrets
  fixture imports redacted with `secret_redacted` diagnostic and zero raw
  spans in `show`/handoff; backup → fresh-home restore round-trip verified.
  How to verify: `npm run check` (covers all five files), plus
  `HARNIE_HOME="$(mktemp -d)" node dist/cli.js backup <path>` /
  `restore <path> --force` spot-check.
  Caveat: same suite-green caveat as Order 1. Redaction is best-effort with a
  legacy caveat (see SUPPORT-MATRIX.md), which is the accepted scope of this gate.
- [ ] **Order 3 — Deliver a complete first-run journey and honest support matrix.**
  Gate: a new developer imports a fixture and their own supported session,
  finds the handoff, and continues it using the docs alone.
  Status 2026-09-07: in progress. Honesty half (this task): SUPPORT-MATRIX.md
  created (evidence-backed, Codex experimental, preview promise verbatim);
  IMPLEMENTATION.md marked superseded (top note only, body untouched).
  Journey half (sibling): `sessions` discovery + `import opencode <ses_id>`
  landed in the working tree and verified live in this pass, but README /
  FIRST-RUN still describe them as absent (stale text reported, not fixed here).
  How to verify: follow `docs/internal/FIRST-RUN.md` on a clean checkout with
  a scratch `HARNIE_HOME`; confirm `harnie sessions`, fixture import, own-session
  import, `show`, `handoff`, and continuation-from-handoff with no other help.
- [x] **Order 4 — Add a minimal stable machine contract and bounded handoffs.**
  Gate: JSON schema/error tests, deterministic output and explicit truncation;
  text compatibility retained.
  Status: done (landed in the working tree; re-read 2026-09-07). Opt-in
  schema-versioned `--json` with stable error codes on inspection/handoff
  commands (`src/contract/`, `docs/internal/MACHINE-CONTRACT.md`); total
  bounded-handoff size budget with explicit omitted counts.
  Evidence: `tests/contract-json.test.ts`, `tests/contract-errors.test.ts`,
  `tests/handoff-bounds.test.ts`; text compatibility retained
  (`tests/eval-harness.test.ts`, `tests/cli-init.test.ts`).
  How to verify: `node dist/cli.js <command> --json` output matches the
  envelope schema in MACHINE-CONTRACT.md; `npm run check`.
- [x] **Order 5 — Re-run continuation evaluation on the release candidate.**
  Gate: unrelated-repository tasks, bidirectional paths, baseline comparison,
  raw outcome evidence; no false completion or repeated completed edits in the
  benchmark tasks for the initial preview gate.
  Status: done 2026-09-07 (initial preview gate PASS, with limits below).
  Evidence: `docs/research/eval-2026-09-07/` — `summary.md`/`summary.json`
  (from `node scripts/eval-continuation.mjs summarize`), 8 registered
  `result.json`s + raw logs/diffs under `runs/eval-20260907T2041/`, and the
  full report in that directory's `README.md`. 4 unrelated tasks ×
  {handoff, baseline} on fresh clones of the RC worktree snapshot
  (`3cfc045`), receiver `opencode run --auto` with
  `opencode-go/kimi-k2.7-code`. Result: no false completion, no repeated
  finished edits, no out-of-scope edits in any condition; verification
  independently re-run by the evaluator in every clone; handoff condition
  faster and with less exploration in 4/4 pairs.
  Caveats recorded honestly in the results README: synthetic (not live)
  driver sessions produced the handoffs; single receiver/model; pi and codex
  receivers NOT exercised, so the "bidirectional paths" element of the gate
  is only partially covered (codex/pi non-interactive flags verified
  statically only); first evaluation attempt was discarded after a harness
  `PWD` bug let receivers edit the real repo (documented, repo restored,
  harness fixed, `tests/eval-harness.test.ts` green after changes).
  How to verify: `node scripts/eval-continuation.mjs tasks --json`;
  re-run §6 of EVALUATION-PROTOCOL.md; inspect `docs/research/eval-2026-09-07/`.
- [ ] **Order 6 — Tag and release a developer preview.**
  Gate: named release candidate, green automated checks, tested install
  instructions, known limitations, recovery instructions.
  Status 2026-09-08: **prepared, pending tag.** All gate ingredients are on
  the working tree: named RC `0.1.0-rc.1` (package.json + package-lock via
  npm; `private: true` kept, distribution via `npm pack` tarball); CI workflow
  `.github/workflows/ci.yml` (Node 22.23.0, `npm ci && npm run check`;
  package smoke test runs offline); install instructions re-verified for the
  RC (`npm pack` → tarball install into an empty dir → `--help` / `init` /
  fixture import / `handoff` under an isolated `HARNIE_HOME`;
  `harnie-0.0.0.tgz` reference in README fixed to `harnie-0.1.0-rc.1.tgz`);
  release notes with known limitations + recovery pointer
  (`docs/internal/RELEASE-0.1.0-rc.1.md`); recovery source
  `docs/internal/BACKUP-RECOVERY.md`; Orders 4–5 done, Order 3 journey text
  refreshed (README/FIRST-RUN now document `sessions`).
  Exactly what remains (user-executed, explicit handoff — nothing is
  committed, tagged, pushed, or staged by the release prep):
  1. `git commit` the working tree, 2. `git tag v0.1.0-rc.1`, 3. `git push`
  (with tags), 4. confirm CI green on the pushed tag.
  How to verify: `npm run check` (final numbers recorded in
  RELEASE-0.1.0-rc.1.md and the release-prep pass: see checklist note below),
  `npm run test:package`, install-instructions walkthrough on a clean machine,
  release tag.
