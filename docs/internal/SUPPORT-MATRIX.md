# Harnie Capability / Compatibility Matrix

Date: 2026-09-08. Source of truth for what the built CLI actually does.
Supersedes the V0-only scope of `docs/internal/IMPLEMENTATION.md` (kept as historical intent).

**Preview promise:** "Import supported local coding sessions, inspect evidence-backed work history, and prepare Markdown continuation packages."

We do not claim native resume, universal session compatibility, or quantified productivity savings.

## How to read this

- **Status** is one of `supported` (verified below), `experimental` (works in
  the verified scope, but a stated gate is missing), or `planned` (not present).
- **Evidence** is either a committed test file or a manual run of the built CLI
  (`npm run build` + `node dist/cli.js`) against committed fixtures with an
  isolated `HARNIE_HOME` under `/var/folders/0l/78s52pw50l1c_qn0f5p6wb9w0000gn/T/opencode/`.
  Nothing here is asserted without one of those two.
- Manual runs below were performed 2026-09-07 against the working-tree build
  (which includes the `sessions` work). The release candidate is
  `0.1.0-rc.4` (RC3 is published — tag `v0.1.0-rc.3` → `cbe5399`,
  release asset `harnie-0.1.0-rc.3.tgz` SHA-256
  `bebf9201d497a9b3b92c1e2e8a6246404ea2d8586e14b63ef80bc6c09d0407f9`,
  `isPrerelease` true, verified by clean install 2026-09-09;
  RC4 = RC3 + post-rc.3 remediation: parse-before-help strictness on all
  four help short-circuits, eval record schema v2 with the v1 validator
  retained, two-verdict evaluation reporting, portable evaluation
  evidence paths + per-run `run.json`/summaries + the `verify-evidence`
  integrity subcommand, release-doc status corrections).
  `npm run check` was re-run green on the RC4 tree on 2026-09-10 (see
  `docs/internal/RELEASE-0.1.0-rc.4.md`) and the packed install flow was
  re-verified against an isolated `HARNIE_HOME`.
- **Honest semantics (applies to every row that mentions goal / decisions /
  findings):** goal is the first user message, decisions are assistant "I will"
  sentences, findings are assistant sentences after tool results. These are
  **rule-derived claims with per-claim provenance** (`tests/derive.test.ts`,
  `tests/context.test.ts`) — traceable, but not necessarily true, current, or
  settled. `show` / handoff output is evidence to inspect, not gospel.

## Matrix

| Capability | Status | Evidence | Known limits |
| --- | --- | --- | --- |
| `import pi <path>` — Pi session JSONL | supported | Manual run 2026-09-07 (isolated home): `tests/fixtures/pi/trace-b-unfinished.jsonl` → `work:pi:harnie-tb-da82c4f8`, 18 events; re-import → 0 events (idempotent). Real local session `~/.pi/agent/sessions/--Users-sergio-Developer-pi-playground--/2026-08-29T03-37-13-726Z_*.jsonl` → 37 events with a clean goal. Tests: `tests/cli-import.test.ts`, `tests/import.test.ts`, `tests/pi-reader.test.ts`, `tests/pi-normalize.test.ts`, `tests/pi-graph.test.ts`, `tests/pi-correlate.test.ts` | Input shape: one JSON object per line, first line the session header (`{"type":"session","version":3,...}` → `pi-session-v3`; `{"kind":"header","version":4,...}` → `pi-session-v4`, `src/pi/detect.ts`). Unrecognized headers import best-effort with an `unsupported_source_family` warning (verified: headerless file → `work:pi:unknown-session`, 2 events). Malformed lines are skipped with per-line diagnostics, not fatal. Explicit path required unless discovered via `sessions`. Fixtures are sanitized derivatives of real Pi v3 sessions, not exhaustive (`tests/fixtures/pi/README.md`). |
| `import opencode <path\|session-id>` — OpenCode session | supported | Manual run 2026-09-07: `tests/fixtures/opencode/sprint-012-handoff.json` → `work:opencode:ses_f9b89b960ffeANOCU95mXvYqyM`, 60 events. Live session id `ses_f822c2bd1ffecTGjnQoHk93tmI` → 249 events. Tests: `tests/cli-import-opencode.test.ts`, `tests/opencode-reader.test.ts`, `tests/opencode-observe.test.ts` | Two accepted shapes only: (a) Harnie snapshot JSON `{"harness":"opencode","format":"opencode-session-v1","session"/"message"/"part"}` (`src/opencode/types.ts`); anything else is rejected with an actionable error naming both shapes. (b) A live `ses_...` id, read read-only from `~/.local/share/opencode/opencode.db` via the bundled SQLite reader (`src/opencode/import-db.ts`, `readOpenCodeSqliteFile` in `src/opencode/reader.ts`). A raw database *path* is not accepted on the CLI. The committed fixture is a sanitized snapshot of one isolated-XDG session, not a production chat (`tests/fixtures/opencode/README.md`). |
| `import codex <path>` — Codex rollout JSONL | experimental | Manual run 2026-09-07: `tests/fixtures/codex/unfinished-read.jsonl` → `work:codex:01codexunfinished000000000001`, 8 events. Real local rollout `~/.codex/sessions/2026/09/07/rollout-2026-09-07T14-36-06-*.jsonl` → 10 events, `show` + `handoff --to codex` render. Tests: `tests/cli-import-codex.test.ts`, `tests/codex-reader.test.ts`, `tests/codex-observe.test.ts` | **Why experimental:** the adapter was validated against invented sanitized rollout JSONL, not production `~/.codex` chats (`docs/research/sprint-017-outcome.md`, `tests/fixtures/codex/README.md`). Import-side live gate remains limited: the 2026-09-07 real-rollout import is a single manual datapoint, not a gate. Receiver side stated precisely: **Codex→OpenCode executed successfully (transport/receiver compatibility)** — the 09-09 handoff context was unrelated to the benchmark task (no semantic-continuation claim); the 09-10 rc.3 leg D used task-matching driver context and its handoff + baseline PASS (`docs/research/eval-2026-09-09/`, `docs/research/eval-2026-09-10/`). Codex→Pi remains provider-blocked. Input shape: first record must be `{"type":"session_meta",...}` or import fails with an actionable error. Observed real-data limit: goal derivation takes the first user message, which in the real rollout was raw `<environment_context>` XML (workspace roots, permission profile) — not the user's task. Typed `reasoning` items never become decisions. |
| `sessions [--harness pi\|opencode\|codex]` — local session discovery | supported | Manual run 2026-09-07: lists real local Pi sessions (`~/.pi/agent/sessions/...`), OpenCode sessions (`ses_...` from the live `opencode.db`), and Codex rollouts (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`), each row printing its ready-to-run `harnie import ...` command. Unknown harness (`claude`) is rejected with usage. Tests: `tests/cli-sessions.test.ts` (uses `HARNIE_DISCOVERY_HOME` overrides, not the real home) | Read-only listing; imports nothing. Discovery roots are the harnesses' native storage locations — sessions stored elsewhere are not found. (README.md and docs/internal/FIRST-RUN.md previously described this command as absent; both were refreshed and now document it — re-verified 2026-09-08 on the `0.1.0-rc.1` tree.) |
| `import ... --work <id>` — attach as new execution; re-import refresh | supported | Manual run 2026-09-07: `import codex ... --work work:pi:harnie-tb-da82c4f8` → same work id, 8 events inserted, `executions` shows both `execution:pi:...` (18 events) and `execution:codex:...` (8 events). Tests: `tests/cli-import-attach.test.ts` | Target work must exist or import fails with `Work not found: <id>`. Re-importing the same file without `--work` is idempotent (0 new events) — that is the full extent of "refresh"; there is no live-session tailing. Checkpoint-scoped views stay frozen after attach (`tests/cli-handoff-checkpoint.test.ts`). Cross-harness attach mixes providers/models in one work; `executions` keeps them distinguishable. |
| `list` / `show` / `executions` / `history` / `diff` — inspection | supported | Manual run 2026-09-07: `list` table, `show` (goal/next/operations/files/diagnostics), `executions` per-execution counts, `history`, and `diff execution:pi:... execution:codex:...` (message 4 → 2, decisions/next-steps/operations `+`/`-` lines) all render on the isolated home. Tests: `tests/cli-inspect.test.ts`, `tests/store-list.test.ts`, `tests/cli-show-derived.test.ts` (list/show), `tests/cli-work-history.test.ts`, `tests/cli-operations.test.ts`, `tests/work-diff.test.ts` (executions/history/diff) | Text output plus an opt-in `--json` machine contract on inspection and handoff commands (versioned envelope, stable error codes, explicit truncation; `tests/contract-json.test.ts`, `tests/contract-errors.test.ts`, `docs/internal/MACHINE-CONTRACT.md`). Redaction now covers the JSON output pass too: `show --json` redacts all free-text fields and reports the true output-pass span count as `redactions` (`tests/cli-json-redaction.test.ts`). `diff` compares per-execution event counts and derived claims; it is not a semantic merge and does not resolve conflicts. |
| `checkpoint` / `fork` / `handoff --checkpoint` — snapshots | supported | Manual run 2026-09-07: `checkpoint` → `checkpoint:work:pi:harnie-tb-da82c4f8:0001`; `fork` → `work:fork:sezodsdg` pinned to it; `handoff --checkpoint ...:0001 --to pi` renders and writes a separate `<work>.<checkpoint>.pi.md` artifact without overwriting the live one. Tests: `tests/cli-checkpoint.test.ts`, `tests/cli-fork.test.ts`, `tests/cli-handoff-checkpoint.test.ts`, `tests/handoff-operations.test.ts` | Preview is single-writer: exact historical state under concurrent refresh is untested (audit §"Snapshot integrity"), so do not promise it — but checkpoint, fork, and backup writes are atomic (write-to-temp + rename, `tests/fix-checkpoint-atomicity.test.ts`, `tests/fix-fork-atomicity.test.ts`, `tests/fix-backup-atomicity.test.ts`), so a crash mid-write cannot leave a torn snapshot. A fork without `--checkpoint` auto-snapshots first (`pre-fork`). Checkpoint handoffs are frozen projections with event/execution watermarks, not live views. |
| `handoff <work> --to opencode` | supported | Manual run 2026-09-07 (fixture + real local Pi session): Markdown prints to stdout and is saved under `$HARNIE_HOME/handoffs/<work>.md`. Tests: `tests/cli-handoff.test.ts`, `tests/handoff.test.ts`, `tests/handoff-opencode.test.ts` | A Markdown continuation package, not native resume. Total size budget with explicit omitted/truncated counts (`tests/handoff-bounds.test.ts`); findings additionally capped at the latest 5 (`FINDINGS_CAP`, `src/work/handoff.ts`). Per-claim evidence structure lives in Work; the Markdown flattens it. Receiver instructions state recorded commands/permissions are historical evidence, not authorization. Artifacts are written `0600` (directory `0700`) at creation time (`tests/cli-handoff-permissions.test.ts`). |
| `handoff <work> --to pi` | supported | Manual run 2026-09-07: `# Harnie handoff for Pi` renders; artifact `<work>.pi.md`. Tests: `tests/cli-handoff-pi.test.ts`, `tests/handoff-pi.test.ts` | Same bounds as `--to opencode`. Renderer instructs the receiver not to invent Pi JSONL session files. The Pi receiver was exercised live in the extended 2026-09-08 continuation evaluation (`pi -p`) and again in the directed 2026-09-09 matrix (OpenCode→Harnie→Pi handoff PASS n=1, baseline provider-blocked — `docs/research/eval-2026-09-09/`; the baseline/trials remain not-run, recorded with reasons in `docs/research/eval-2026-09-10/`). |
| `handoff <work> --to codex` | experimental | Manual run 2026-09-07 (fixture + real rollout work): `# Harnie handoff for Codex` renders; artifact `<work>.codex.md`. Tests: `tests/cli-handoff-codex.test.ts`, `tests/handoff-codex.test.ts` | Same experimental scope as Codex import (the receiver renders and works; the import adapter stays experimental). Receiver gate stated precisely: Codex→OpenCode executed successfully (transport/receiver compatibility; 09-10 leg D on rc.3, task-matching driver context, handoff + baseline PASS); Codex→Pi remains provider-blocked (402 credits / 429 free tier; probes recorded 09-10). The OpenCode→Harnie→Codex greeting-command leg (09-09) demonstrates continuation semantics (driver steps 1–2 → receiver step 3 only); the 09-09 Codex→OpenCode handoff context was unrelated to its benchmark task, so it does not demonstrate semantic continuation (`docs/research/eval-2026-09-09/`, `docs/research/eval-2026-09-10/`). The import-side live gate remains a single manual datapoint. Renderer instructs the receiver not to invent Codex rollout JSONL records. |
| Redaction at ingestion | supported (best-effort) | Manual run 2026-09-07: `tests/fixtures/redaction/pi-secrets.jsonl` → `show` contains `[REDACTED:env-secret]` / `[REDACTED:bearer-token]`, zero raw `HARNIE_FAKE` spans, `secret_redacted` diagnostic present. Tests: `tests/redaction-ingest.test.ts` (synthetic `HARNIE_FAKE_*` credentials across pi/opencode/codex shapes) | Conservative obvious-secret patterns only (`KEY=`/`TOKEN=` assignments, known provider prefixes, bearer tokens, PEM blocks, `src/work/redact.ts`). Best-effort, not a guarantee — the handoff says so verbatim. Anything the patterns miss is persisted. |
| Redaction at output + file permissions (legacy backstop) | supported (best-effort) | Manual run 2026-09-07: handoff over the redacted work carries the `## Redaction note` (best-effort caveat); observed backup file mode `0600`. Tests: `tests/redaction-output.test.ts` (synthetic legacy secrets written straight to SQLite, bypassing ingestion), `tests/cli-json-redaction.test.ts` (`show --json` redacts free-text fields and reports output-pass counts), `tests/store-permissions.test.ts` (home `0700`, db `0600`, tightening on open), `tests/cli-handoff-permissions.test.ts` (handoff artifact `0600` and `handoffs/` `0700` at creation) | Legacy caveat: stores imported before ingestion redaction existed keep raw values in SQLite — the output backstop redacts display/handoff text only and never rewrites the database. Handoff artifacts are now written `0600` (and the `handoffs/` directory `0700`) at creation time, not converged on a later store open (`tests/cli-handoff-permissions.test.ts`). Copies and backups must be kept private manually; handing an artifact to another agent may transmit its contents through that agent's provider. |
| `backup` / `restore` — operations | supported | Manual run 2026-09-07: `backup <path>` → SQLite snapshot; fresh-home `restore <backup> --force` → `list` shows the backed-up work. Tests: `tests/cli-backup-restore.test.ts` (rich seed: executions, checkpoint, fork, attach — round-tripped) | `restore --force` overwrites the target home's live store — it validates the backup before touching it (`docs/internal/BACKUP-RECOVERY.md`), but there is no undo. The backup covers the SQLite store; `handoffs/` artifacts are regenerable via `handoff` and are not part of the snapshot. |
| Machine contract (`--json`, stable error codes, capability discovery, strict flags) | supported | Opt-in `--json` on `list`/`show`/`executions`/`history`/`diff`/`handoff`/`sessions`: versioned `harnie.cli.v1` envelope on stdout, stable error codes, deterministic output, explicit truncation. `show --json` redacts all free-text fields and reports true output-pass `redactions` counts. Strict flag parsing is now universal: `init`, `import`, `checkpoint`, `fork`, `backup`, and `restore` all reject unknown/extra flags (`tests/cli-strict-args.test.ts`, `tests/cli-init.test.ts`, `tests/cli-backup-restore.test.ts`), and help-mode is now parse-before-help: `--help`/`-h` print help and exit 0 only when the rest of the argv parses cleanly, so e.g. `harnie backup --help --bogus` exits 1 (`tests/cli-help-strict.test.ts`, all four help short-circuits); a top-level `--version`/`-V` prints the package version (`tests/cli-version.test.ts`). Tests: `tests/contract-json.test.ts`, `tests/contract-errors.test.ts`, `tests/handoff-bounds.test.ts`, `tests/cli-json-redaction.test.ts`; spec: `docs/internal/MACHINE-CONTRACT.md` | `init`, `import`, `checkpoint`, `fork`, `backup`, and `restore` do not support `--json` in this version. Text output is not covered by the contract. |

## Deliberately untested / unknown (do not promise)

- Green suite on the release candidate: `npm run check` was re-run on the
  `0.1.0-rc.4` tree on 2026-09-10 — typecheck clean, 63 test files /
  396 tests passed, package smoke passed on v22.23.0 (including the
  strict-flag and `--version` packed repros)
  (`docs/internal/RELEASE-0.1.0-rc.4.md`).
- Suite size: the audit's "191 tests" figure predates the `sessions` work and
  other uncommitted changes; do not quote a count without running the suite.
- Concurrent-write behavior (multiple simultaneous `harnie` processes against
  one home): still untested — but checkpoint, fork, and backup writes are now
  atomic (write-to-temp + rename), so a crash mid-write cannot leave a torn
  snapshot (`tests/fix-checkpoint-atomicity.test.ts`,
  `tests/fix-fork-atomicity.test.ts`, `tests/fix-backup-atomicity.test.ts`).
- Total handoff size budget: bounded and explicitly reported (`tests/handoff-bounds.test.ts`); long/multi-execution performance benchmarks beyond the evaluation legs remain unmeasured.
- Order 5 continuation evaluation on the release candidate: two-verdict
  framing per `docs/internal/EVALUATION-PROTOCOL.md` §4. **Verdict A
  (safety among completed runs): PASS** — 09-09 (7 runs, rc.2,
  `docs/research/eval-2026-09-09/`) + 09-10 (2 runs, rc.3,
  `docs/research/eval-2026-09-10/`). **Verdict B (full matrix gate):
  PARTIAL/INCONCLUSIVE** — do not claim the matrix met: Pi→OpenCode met
  (09-09); OpenCode→Pi handoff PASS n=1 with baseline + trials NOT RUN
  (provider); Codex→Pi NOT RUN (pi receiver provider-blocked, 402
  credits / 429 free tier; probes recorded 09-10); Codex→OpenCode met for
  transport/receiver compatibility only (09-10 leg D on rc.3:
  handoff + baseline PASS with task-matching driver context; the 09-09
  handoff context was unrelated to its benchmark task, no
  semantic-continuation claim); continuation semantics met via
  OpenCode→Codex greeting-command leg (09-09; steps 1–2 → step 3 only).
  Records are schema v2 (v1 validator retained), paths portable, with
  per-run `run.json`/summaries; `verify-evidence` OK on both evidence
  dirs; blocked legs rerunnable once pi is funded — handoff artifacts
  ready + sha-pinned in `docs/research/eval-2026-09-{09,10}/driver/`,
  records show not-run + reasons. pi/opencode drivers synthetic (real
  sessions trivial); n=1 per successful leg. Prior runs:
  `docs/research/eval-2026-09-08/` (receiver compatibility, header
  reclassification notes), `docs/research/eval-2026-09-07/` (initial
  gate).
