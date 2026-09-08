# Harnie Capability / Compatibility Matrix

Date: 2026-09-07. Source of truth for what the built CLI actually does.
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
  `0.1.0-rc.1` (version bumped from `0.0.0` for the Order 6 tag); `npm run
  check` was re-run green on the RC tree on 2026-09-08 (see
  `docs/internal/RELEASE-0.1.0-rc.1.md`) and the packed install flow was
  re-verified against an isolated `HARNIE_HOME`. There is no `--version`
  flag on the CLI (none was ever shipped); report versions via
  `npm ls harnie` or the tarball name.
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
| `import codex <path>` — Codex rollout JSONL | experimental | Manual run 2026-09-07: `tests/fixtures/codex/unfinished-read.jsonl` → `work:codex:01codexunfinished000000000001`, 8 events. Real local rollout `~/.codex/sessions/2026/09/07/rollout-2026-09-07T14-36-06-*.jsonl` → 10 events, `show` + `handoff --to codex` render. Tests: `tests/cli-import-codex.test.ts`, `tests/codex-reader.test.ts`, `tests/codex-observe.test.ts` | **Why experimental:** the adapter was validated against invented sanitized rollout JSONL, not production `~/.codex` chats (`docs/research/sprint-017-outcome.md`, `tests/fixtures/codex/README.md`), and there is still no live receiver/source evaluation gate (audit Order 5). The 2026-09-07 real-rollout import is a single manual datapoint, not a gate. Input shape: first record must be `{"type":"session_meta",...}` or import fails with an actionable error. Observed real-data limit: goal derivation takes the first user message, which in the real rollout was raw `<environment_context>` XML (workspace roots, permission profile) — not the user's task. Typed `reasoning` items never become decisions. |
| `sessions [--harness pi\|opencode\|codex]` — local session discovery | supported | Manual run 2026-09-07: lists real local Pi sessions (`~/.pi/agent/sessions/...`), OpenCode sessions (`ses_...` from the live `opencode.db`), and Codex rollouts (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`), each row printing its ready-to-run `harnie import ...` command. Unknown harness (`claude`) is rejected with usage. Tests: `tests/cli-sessions.test.ts` (uses `HARNIE_DISCOVERY_HOME` overrides, not the real home) | Read-only listing; imports nothing. Discovery roots are the harnesses' native storage locations — sessions stored elsewhere are not found. (README.md and docs/internal/FIRST-RUN.md previously described this command as absent; both were refreshed and now document it — re-verified 2026-09-08 on the `0.1.0-rc.1` tree.) |
| `import ... --work <id>` — attach as new execution; re-import refresh | supported | Manual run 2026-09-07: `import codex ... --work work:pi:harnie-tb-da82c4f8` → same work id, 8 events inserted, `executions` shows both `execution:pi:...` (18 events) and `execution:codex:...` (8 events). Tests: `tests/cli-import-attach.test.ts` | Target work must exist or import fails with `Work not found: <id>`. Re-importing the same file without `--work` is idempotent (0 new events) — that is the full extent of "refresh"; there is no live-session tailing. Checkpoint-scoped views stay frozen after attach (`tests/cli-handoff-checkpoint.test.ts`). Cross-harness attach mixes providers/models in one work; `executions` keeps them distinguishable. |
| `list` / `show` / `executions` / `history` / `diff` — inspection | supported | Manual run 2026-09-07: `list` table, `show` (goal/next/operations/files/diagnostics), `executions` per-execution counts, `history`, and `diff execution:pi:... execution:codex:...` (message 4 → 2, decisions/next-steps/operations `+`/`-` lines) all render on the isolated home. Tests: `tests/cli-inspect.test.ts`, `tests/store-list.test.ts`, `tests/cli-show-derived.test.ts` (list/show), `tests/cli-work-history.test.ts`, `tests/cli-operations.test.ts`, `tests/work-diff.test.ts` (executions/history/diff) | Text output only — there is no `--json` machine contract (planned, launch Order 4). `diff` compares per-execution event counts and derived claims; it is not a semantic merge and does not resolve conflicts. |
| `checkpoint` / `fork` / `handoff --checkpoint` — snapshots | supported | Manual run 2026-09-07: `checkpoint` → `checkpoint:work:pi:harnie-tb-da82c4f8:0001`; `fork` → `work:fork:sezodsdg` pinned to it; `handoff --checkpoint ...:0001 --to pi` renders and writes a separate `<work>.<checkpoint>.pi.md` artifact without overwriting the live one. Tests: `tests/cli-checkpoint.test.ts`, `tests/cli-fork.test.ts`, `tests/cli-handoff-checkpoint.test.ts`, `tests/handoff-operations.test.ts` | Preview is single-writer: exact historical state under concurrent refresh is untested (audit §"Snapshot integrity"), so do not promise it. A fork without `--checkpoint` auto-snapshots first (`pre-fork`). Checkpoint handoffs are frozen projections with event/execution watermarks, not live views. |
| `handoff <work> --to opencode` | supported | Manual run 2026-09-07 (fixture + real local Pi session): Markdown prints to stdout and is saved under `$HARNIE_HOME/handoffs/<work>.md`. Tests: `tests/cli-handoff.test.ts`, `tests/handoff.test.ts`, `tests/handoff-opencode.test.ts` | A Markdown continuation package, not native resume. Bounded but not budgeted: findings are capped at the latest 5 (`FINDINGS_CAP`, `src/work/handoff.ts`); goals, decisions, operations, and paths have no total size budget (audit §"Bounded packages"). Per-claim evidence structure lives in Work; the Markdown flattens it. Receiver instructions state recorded commands/permissions are historical evidence, not authorization. |
| `handoff <work> --to pi` | supported | Manual run 2026-09-07: `# Harnie handoff for Pi` renders; artifact `<work>.pi.md`. Tests: `tests/cli-handoff-pi.test.ts`, `tests/handoff-pi.test.ts` | Same bounds as `--to opencode`. Renderer instructs the receiver not to invent Pi JSONL session files. No live Pi continuation gate has been re-run on the release candidate (launch Order 5). |
| `handoff <work> --to codex` | experimental | Manual run 2026-09-07 (fixture + real rollout work): `# Harnie handoff for Codex` renders; artifact `<work>.codex.md`. Tests: `tests/cli-handoff-codex.test.ts`, `tests/handoff-codex.test.ts` | Same experimental reason as Codex import: no live receiver/source evaluation supports stronger claims. Renderer instructs the receiver not to invent Codex rollout JSONL records. |
| Redaction at ingestion | supported (best-effort) | Manual run 2026-09-07: `tests/fixtures/redaction/pi-secrets.jsonl` → `show` contains `[REDACTED:env-secret]` / `[REDACTED:bearer-token]`, zero raw `HARNIE_FAKE` spans, `secret_redacted` diagnostic present. Tests: `tests/redaction-ingest.test.ts` (synthetic `HARNIE_FAKE_*` credentials across pi/opencode/codex shapes) | Conservative obvious-secret patterns only (`KEY=`/`TOKEN=` assignments, known provider prefixes, bearer tokens, PEM blocks, `src/work/redact.ts`). Best-effort, not a guarantee — the handoff says so verbatim. Anything the patterns miss is persisted. |
| Redaction at output + file permissions (legacy backstop) | supported (best-effort) | Manual run 2026-09-07: handoff over the redacted work carries the `## Redaction note` (best-effort caveat); observed backup file mode `0600`. Tests: `tests/redaction-output.test.ts` (synthetic legacy secrets written straight to SQLite, bypassing ingestion), `tests/store-permissions.test.ts` (home `0700`, db `0600`, tightening on open, handoff artifacts converging to `0600`) | Legacy caveat: stores imported before ingestion redaction existed keep raw values in SQLite — the output backstop redacts display/handoff text only and never rewrites the database. A freshly written handoff artifact may briefly carry process-default modes until the next store open. Copies and backups must be kept private manually; handing an artifact to another agent may transmit its contents through that agent's provider. |
| `backup` / `restore` — operations | supported | Manual run 2026-09-07: `backup <path>` → SQLite snapshot; fresh-home `restore <backup> --force` → `list` shows the backed-up work. Tests: `tests/cli-backup-restore.test.ts` (rich seed: executions, checkpoint, fork, attach — round-tripped) | `restore --force` overwrites the target home's live store — it validates the backup before touching it (`docs/internal/BACKUP-RECOVERY.md`), but there is no undo. The backup covers the SQLite store; `handoffs/` artifacts are regenerable via `handoff` and are not part of the snapshot. |
| Machine contract (`--json`, stable error codes, capability discovery) | planned | Absent from the final CLI usage text (`src/cli.ts`, re-read 2026-09-07): no `--json` flag on any command. | Launch Order 4. Agents must parse the human-readable text output until then. |

## Deliberately untested / unknown (do not promise)

- Green suite on the release candidate: `npm run check` was re-run on the
  `0.1.0-rc.1` tree on 2026-09-08 — typecheck clean, 55 test files /
  333 tests passed, package smoke passed on v22.23.0
  (`docs/internal/RELEASE-0.1.0-rc.1.md`).
- Suite size: the audit's "191 tests" figure predates the `sessions` work and
  other uncommitted changes; do not quote a count without running the suite.
- Concurrent-write / snapshot-atomicity behavior (audit code-inspection
  concerns in `src/store/checkpoints.ts`, `src/store/fork.ts`): untested.
- Total handoff size budget and long/multi-execution benchmarks (audit
  §"Bounded packages"): unmeasured.
- Order 5 continuation evaluation on the release candidate: run 2026-09-07,
  verdict PASS on all four benchmark tasks with limits (synthetic driver
  sessions, single receiver/model, pi/codex receivers not exercised) —
  `docs/research/eval-2026-09-07/`.
