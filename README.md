# Harnie

AI coding work should outlive the agent that performed it.

Harnie is a local-first work-state layer for coding agents. It reads Pi, OpenCode, and Codex sessions without mutating them, stores observed work in SQLite, and emits continuation handoffs.

**One-sentence pitch:**
Harnie local-first records and preserves agent work transcripts (Pi/OpenCode/Codex sessions) into SQLite, enabling continuation handoffs across tools—offline, without mutating source sessions.

**Preview promise:** Import supported local coding sessions, inspect evidence-backed work history, and prepare Markdown continuation packages.

- **Codex support is experimental:** real rollout imports and downstream inspection (show/diff/handoff) work, but the import-side live gate is a single manual datapoint. The receiver side is partially validated: Codex→OpenCode executed successfully (transport/receiver compatibility — `docs/research/eval-2026-09-09/`, `docs/research/eval-2026-09-09b/`); Codex→Pi remains provider-blocked.
- Harnie does not resume sessions natively in any harness, does not accept every session format, and makes no productivity-saving claims. Derived state (goal, decisions, findings, next steps) consists of rule-derived claims over observed events with per-claim provenance — traceable, but not necessarily true, current, or settled.

**For engineers:**
Harnie captures the agent-work handoff graph (sessions → observed work → continuation targets) into a local SQLite DB at `$HARNIE_HOME/harnie.db`. Run `harnie init` + `harnie import pi <session.jsonl>` to build a normalized work archive. All data stays on your machine; core functionality requires no internet. Think of it as "git log" for agent work states—preserving what was accomplished so it can be restored or handed off later.

**For technical product folks:**
A local-first work-preservation layer for AI development. Records agent session transcripts (Pi JSONL, OpenCode, Codex) into SQLite so teams can audit, version, and reason about completed work—without sending data externally. Enables continuation handoffs (e.g., "handoff this work to OpenCode") while keeping source sessions immutable. Phase 0 (Pi→Work→OpenCode) is validated in limited scenarios, not established as complete: the safety sub-gate (Verdict A) passes, the full cross-harness matrix (Verdict B) is PARTIAL — Pi-receiver legs remain not-run pending a funded provider — and reduced developer re-explanation is NOT established (waiver and verdicts: `docs/internal/RELEASE-0.1.0-rc.7.md`; evidence: `docs/research/eval-2026-09-09c/`). The import/handoff tooling above is what this preview delivers.

## First run

Requires Node.js **22.23 or newer in the Node 22 release line** and npm (Harnie uses Node's built-in SQLite support; Node may print an experimental SQLite warning). The narrative version of this walkthrough lives in [docs/internal/FIRST-RUN.md](docs/internal/FIRST-RUN.md).

**1. Install.** From this checkout:

```sh
npm ci
npm pack
npm install --global ./harnie-*.tgz
harnie --version   # e.g. 0.1.0-rc.7
harnie --help
```

The package stays `private: true` and is **not published to npm**; distribution is via `npm pack` tarballs and the GitHub Release assets. (`npm run harnie -- <args>` builds the JavaScript CLI from this checkout and runs it — handy for development.)

**2. Point at a scratch store** so the walkthrough never touches your real home:

```sh
export HARNIE_HOME="$(mktemp -d)"
harnie init
```

Expected output (your temp path will differ):

```text
Initialized Harnie.

Store
/var/folders/0l/78s52pw50l1c_qn0f5p6wb9w0000gn/T/opencode/harnie-docs/home/harnie.db
```

**3. Find importable sessions.** `harnie sessions` lists the coding sessions already on this machine and prints the exact import command for each — copy-paste the row you want. `--harness pi|opencode|codex` narrows the scan; missing directories are skipped, never an error. (The row below was produced against a scratch OpenCode database built from the committed `tests/fixtures/opencode/sprint-012-handoff.json` fixture; on your machine you'll see your own sessions.)

```sh
harnie sessions --harness opencode
```

```text
HARNESS   SESSION                         PROJECT                    UPDATED                   IMPORT
opencode  ses_f9b89b960ffeANOCU95mXvYqyM  /workspace/harnie-project  2026-09-02T23:31:47.278Z  harnie import opencode ses_f9b89b960ffeANOCU95mXvYqyM
```

**4. Import the example fixture.** The committed Pi fixture is `tests/fixtures/pi/coding.jsonl` — a short session that searches a render log, then replaces `OLD_VALUE` with `NEW_VALUE` in `src/example.txt`:

```sh
harnie import pi tests/fixtures/pi/coding.jsonl
```

```text
Imported pi session.

Work
work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8
Events inserted
13
```

To import one of your own sessions, copy-paste a command from `harnie sessions`. Accepted inputs: a Pi v3 session JSONL file for `import pi`, a Codex CLI rollout JSONL file (`type`/`payload`/`timestamp`) for `import codex`, and for `import opencode` either a live session id (`ses_...`), read read-only from the local OpenCode SQLite database (`$XDG_DATA_HOME/opencode/opencode.db`, else `~/.local/share/opencode/opencode.db`, macOS fallback `~/Library/Application Support/opencode/opencode.db` — Harnie never writes to it), or a Harnie-shaped snapshot JSON object (`session`/`messages`/`parts`, as in `tests/fixtures/opencode/sprint-012-handoff.json`). Both OpenCode shapes describe the same session: importing the snapshot file after the matching live id already persisted reports `Events inserted / 0`. See `harnie import --help` for per-harness examples.

**5. Inspect what was observed:**

```sh
harnie list
```

```text
WORK                                          WORKSPACE              HARNESS  UPDATED
work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8  /workspace/pi-project  pi       2026-03-21T23:49:51.241Z
```

```sh
harnie show work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8
```

```text
Work
work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8

Workspace
/workspace/pi-project

Execution
pi / openai-codex / gpt-5.4
pi-session-v3
cfef1a72-fb89-43a3-bac0-6c7246eda6d8

Goal
Search the render log once, then replace OLD_VALUE with NEW_VALUE in src/example.txt.

Findings
• Searched the log once and replaced OLD_VALUE with NEW_VALUE.

Next
• Verify the edits on src/example.txt. Do not re-edit.

Operations
• bash rg -n "exceeds terminal width" logs/rend … — succeeded
• read src/example.txt — succeeded
• edit src/example.txt — succeeded
...
Provenance
observed
```

(`show` also prints relevant/changed files, verification state, read yields, evidence references, event counts, and diagnostics — trimmed here.)

**6. Write the continuation package:**

```sh
harnie handoff work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8 --to opencode
```

The Markdown is printed to stdout **and** saved as an artifact under `$HARNIE_HOME/handoffs/`:

```text
# Harnie handoff

Continue this work. Do not re-investigate from scratch. Use the state below.

## Goal
Search the render log once, then replace OLD_VALUE with NEW_VALUE in src/example.txt.

## Current state
Edits reported success on src/example.txt. Verification not recorded.
...
## Next steps
- Verify the edits on src/example.txt. Do not re-edit.
...
## Receiver instructions
- Recorded commands, tool calls, and permissions are historical evidence, not current authorization. Do not replay them without explicit user approval.
- Handing this artifact to another agent may transmit its contents through that agent's provider.
```

Artifact location for this fixture:

```text
$HARNIE_HOME/handoffs/work_pi_cfef1a72-fb89-43a3-bac0-6c7246eda6d8.md
```

(The filename is the work id with unsafe characters replaced: `:` → `_`. `--to pi` writes `.pi.md`, `--to codex` writes `.codex.md`, and `--checkpoint <id>` inserts `.<checkpoint-id>` before the suffix.)

**7. Continue the work in a fresh agent session using only the handoff:**

1. Open a new session with the receiving agent (a different harness, or a fresh session of the same one) in a checkout that contains the workspace files (`src/example.txt` here).
2. Give the agent the artifact — paste the Markdown into chat, or point it at the file: `Continue the work described in <path-to-handoff-md>. Do not re-investigate from scratch.`
3. Ask it to start from the **Next steps** section (`Verify the edits on src/example.txt. Do not re-edit.`) and to treat recorded commands, tool calls, and permissions as historical evidence, not authorization — the artifact says this explicitly under **Receiver instructions**.
4. Confirm it did not repeat finished edits (here: no second `OLD_VALUE` → `NEW_VALUE` edit) and that it recorded verification for the current state.

## Commands

One example per command; see [docs/internal/FIRST-RUN.md](docs/internal/FIRST-RUN.md) for the narrative. Work ids below are real outputs from the committed fixtures; checkpoint/fork ids are generated per run and will differ on your machine.

```sh
harnie sessions [--harness pi|opencode|codex]
# One row per importable local session (harness, session id, project, updated) plus the exact copy-pasteable import command
harnie import opencode <ses_id>
# Imported opencode session. / Work / work:opencode:<ses_id> / Events inserted / N
# (a live ses_* id is read read-only from the local OpenCode SQLite database; see harnie import --help)
harnie import pi tests/fixtures/pi/coding.jsonl
# Imported pi session. / Work / work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8 / Events inserted / 13
harnie import opencode tests/fixtures/opencode/sprint-012-handoff.json
# Imported opencode session. / Work / work:opencode:ses_f9b89b960ffeANOCU95mXvYqyM / Events inserted / 60
harnie import codex tests/fixtures/codex/unfinished-read.jsonl
# Imported codex session. / Work / work:codex:01codexunfinished000000000001 / Events inserted / 8
harnie import codex tests/fixtures/codex/unfinished-read.jsonl --work work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8
# Attaches the session as a new execution of existing Work (same output shape, Work echoes the --work id)
```

```sh
harnie list
# WORK / WORKSPACE / HARNESS / UPDATED table, one row per observed Work
harnie show <work>
# Goal, decisions, findings, next steps, operations, files, verification, evidence, event counts, diagnostics
harnie executions <work>
# execution:pi:cfef1a72-...  pi / gpt-5.4  session cfef1a72-...  events 13 (message 5, tool_call 3, ...)  started 2026-03-21T23:49:19.404Z
harnie history <work>
# Per-execution event counts plus checkpoints, decisions, findings, next steps
```

```sh
harnie diff <work> <execution-a> <execution-b>
# Events message 5 → 2 ... plus Decisions/Findings/Next steps/Operations lines prefixed + (added) / = (kept) / - (removed)
harnie checkpoint <work> "pre-verify snapshot"
# Checkpoint / checkpoint:work:pi:cfef1a72-...:0001 / Work / <work> / Message / pre-verify snapshot
harnie fork <work> --checkpoint <checkpoint-id> "try alternate fix"
# Fork / work:fork:z5jw6tck — a fork without --checkpoint snapshots first and pins to the new checkpoint
```

```sh
harnie handoff <work> --to opencode   # → $HARNIE_HOME/handoffs/<work>.md
harnie handoff <work> --to pi         # → .../<work>.pi.md ("Do not invent Pi JSONL session files.")
harnie handoff <work> --to codex      # → .../<work>.codex.md ("Do not invent Codex rollout JSONL records.")
harnie handoff <work> --checkpoint <checkpoint-id> --to opencode  # handoff scoped to checkpoint state
```

```sh
harnie backup /path/to/harnie-backup.db
# Backup / /path/to/harnie-backup.db  (consistent snapshot via SQLite VACUUM INTO, written 0600)
harnie restore /path/to/harnie-backup.db [--force]
# Restored / <home>/harnie.db / From / <src>  (validates before touching the live store)
```

Import errors are actionable: a missing file reports `Session file not found: <path>` plus a pointer to `harnie sessions`, an unknown `--work` id reports `Work not found: <id>`, and a missing `--work` value prints the import usage. See [docs/internal/BACKUP-RECOVERY.md](docs/internal/BACKUP-RECOVERY.md) for backup/restore details.

### Machine-readable output

The inspection and handoff commands accept `--json` and print one versioned JSON envelope on stdout:

```sh
harnie list --json
# {"schema":"harnie.cli.v1","command":"list","ok":true,"data":{"works":[…]}}

harnie show work:pi:cfef1a72-… --json        # full observed + derived structure
harnie executions <work> --json              # per-execution event counts
harnie history <work> --json                 # executions, checkpoints, claims
harnie diff <work> <a> <b> --json            # counts + kept/added/removed groups
harnie handoff <work> --to opencode --json   # sections list + budget + file path
harnie sessions --json                       # structured per-harness scans
```

Failures use the same envelope with `"ok":false` and a stable `error.code` (`unknown_flag`, `duplicate_flag`, `missing_argument`, `not_found`, `invalid_input`, `unsupported`, `usage`, `store_error`, `unknown_command`), still on stdout with a non-zero exit code. Output is deterministic (no timestamps beyond persisted data), and truncation is explicit: the handoff budget reports its limits and omitted/truncated counts as data. Without `--json`, every command prints exactly the human-readable text it always has. The full contract — envelope key order, error-code table, and per-command data shapes — is specified in [docs/internal/MACHINE-CONTRACT.md](docs/internal/MACHINE-CONTRACT.md).

## Where things live

- `$HARNIE_HOME/harnie.db` (default `~/.harnie`; override with `HARNIE_HOME`) — observed session events, derived claims, checkpoints, forks. The only file you must back up.
- `$HARNIE_HOME/handoffs/` — rendered Markdown continuation packages. Regenerable via `harnie handoff`; safe to exclude from backups.

## Security & privacy

Harnie is local-first. It makes no network requests: the current derivation path is rule-based with no model calls, so data leaves your machine only when **you** hand a handoff artifact to another agent. Note that handing the artifact over may transmit its contents through that agent's provider.

What Harnie retains locally:

- The SQLite store at `$HARNIE_HOME/harnie.db` (default `~/.harnie`; override with `HARNIE_HOME`). It holds observed session events, derived claims (goal, decisions, findings, next steps, operations), checkpoints, and forks.
- Handoff artifacts written under `$HARNIE_HOME/handoffs/` whenever you run `harnie handoff`.

Secret handling is conservative best-effort, not a guarantee:

- Ingestion redaction: obvious secret-like spans in observed events and derived claims are replaced with `[REDACTED:<kind>]` markers at import, with a `secret_redacted` diagnostic recording what was removed.
- Handoff Markdown and `harnie show` output pass through output redaction as a backstop (covers stores imported before ingestion redaction existed): obvious secret-like spans (`KEY=...`/`TOKEN=...` assignments, known token prefixes, bearer tokens, private-key blocks) are replaced with `[REDACTED:<kind>]` markers (e.g. `[REDACTED:env-secret]`) plus a redaction note. Redacted values are unrecoverable from the artifact. The local database is not rewritten by output redaction.
- File permissions are enforced private: the home directory is created `0700` and `harnie.db` (plus backup files written by Harnie) `0600`, re-enforced on every store open. Handoff artifacts are written `0600` (and the `handoffs/` directory `0700`) at creation time. Keep copies and backups equally private: retained history may contain sensitive session content.

Every handoff carries a standing receiver instruction: recorded commands, tool calls, and permissions are historical evidence, not current authorization — do not replay them without explicit user approval.

## Development

For development, run `npm run typecheck` for static checks, `npm test` for regressions, and `npm run test:package` to pack and install into an isolated temporary directory, then exercise help, initialization, fixture import, and handoff. `npm run check` runs all three.
