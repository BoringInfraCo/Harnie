# Harnie first run

A narrative walkthrough for a new developer: install Harnie, discover what
is importable, import the committed Pi fixture (plus your own supported
session), inspect the observed
work, produce a continuation package, and continue the work in a fresh agent
session using only the handoff. Every command and output below was produced
with the built CLI (`npm run build`, then `node dist/cli.js`) against a
scratch store with `HARNIE_HOME` and the session-discovery locations pointed
at scratch directories under the OS temp root, on Node 22.23.0. Generated
ids (checkpoints, forks) differ per
run; fixture-derived work ids are deterministic.

## 0. Install

From a checkout of the Harnie repository:

```sh
npm ci
npm pack
npm install --global ./harnie-0.0.0.tgz
harnie --help
```

`harnie --help` lists every command:

```text
Usage: harnie <command>

Commands:
  init              Create the Harnie home directory and SQLite store
  import pi <path>  Import a Pi session as observed Work
  import opencode <path|session-id>
                    Import an OpenCode session as observed Work
                    (snapshot JSON file, or a live ses_* id from the
                    local OpenCode database; see import --help)
  import codex <path>
                    Import a Codex rollout as observed Work
                    (--work <id> attaches as a new execution)
  import --help     Explain valid per-harness import paths
  sessions [--harness pi|opencode|codex]
                    List local sessions available for import
  list              List persisted observed Work
  show <work>       Show observed Work
  executions <work> List executions of observed Work
  history <work>    Show execution history of observed Work
  checkpoint <work> [message]
                     Create a checkpoint snapshot of observed Work
  fork <work> [--checkpoint <id>] [message]
                     Fork observed Work at a checkpoint
  diff <work> <execution-a> <execution-b>
                    Diff two executions of observed Work
  handoff <work> [--checkpoint <id>] --to <target>
                     Write a continuation handoff for opencode, pi, or codex
  backup <path>      Write a consistent snapshot of the SQLite store
  restore <path> [--force]
                     Restore the store from a backup file
```

`harnie sessions` (section 2) finds what is already importable on this
machine, and `harnie import --help` spells out the accepted shapes per
harness, including live OpenCode session ids.

## 1. Create a scratch store

Keep fixture experiments out of your real home:

```sh
export HARNIE_HOME="$(mktemp -d)"
harnie init
```

```text
Initialized Harnie.

Store
/var/folders/0l/78s52pw50l1c_qn0f5p6wb9w0000gn/T/opencode/harnie-docs/home/harnie.db
```

(your temp path will differ)

The home directory is created owner-only (`0700`) and the SQLite store
owner-read/write (`0600`), re-enforced on every store open. Everything
below lives under `$HARNIE_HOME`: `harnie.db` (the store) and `handoffs/`
(rendered continuation packages).

## 2. Find importable sessions

Before importing anything by hand, ask Harnie what is already importable on
this machine. `harnie sessions` scans the known local session locations —
Pi (`$PI_CODING_AGENT_SESSION_DIR`, else `~/.pi/agent/sessions/`), Codex
(`$CODEX_HOME/sessions/` and `$CODEX_HOME/archived_sessions/`), and OpenCode
(`$XDG_DATA_HOME/opencode/opencode.db`, else `~/.local/share/opencode/opencode.db`,
macOS fallback `~/Library/Application Support/opencode/opencode.db`) — and
prints one row per session with the exact copy-pasteable import command:

```sh
harnie sessions
```

```text
HARNESS  SESSION                          PROJECT                                                      UPDATED                   IMPORT
pi       2026-03-21T23-49-19-000Z_coding  ----Users-sergio-Documents-Developer-BoringInfraCo-Harnie--  2026-09-07T22:27:39.627Z  harnie import pi "/var/folders/0l/78s52pw50l1c_qn0f5p6wb9w0000gn/T/opencode/harnie-docs/discovery/pi/agent/sessions/----Users-sergio-Documents-Developer-BoringInfraCo-Harnie--/2026-03-21T23-49-19-000Z_coding.jsonl"
HARNESS   SESSION                         PROJECT                    UPDATED                   IMPORT
opencode  ses_f9b89b960ffeANOCU95mXvYqyM  /workspace/harnie-project  2026-09-02T23:31:47.278Z  harnie import opencode ses_f9b89b960ffeANOCU95mXvYqyM
HARNESS  SESSION                        PROJECT                   UPDATED                   IMPORT
codex    01codexunfinished000000000001  /workspace/codex-project  2026-09-07T22:27:39.629Z  harnie import codex "/var/folders/0l/78s52pw50l1c_qn0f5p6wb9w0000gn/T/opencode/harnie-docs/discovery/codex/sessions/2026/03/21/rollout-2026-03-21T23-49-19-000Z-unfinished-read.jsonl"
```

(The rows above were produced with the discovery locations pointed at a
scratch layout seeded from the committed fixtures — the Pi and Codex
fixtures copied into Pi/Codex-style paths, and an `opencode.db` built from
`tests/fixtures/opencode/sprint-012-handoff.json` — so ids are reproducible.
On your machine you will see your own sessions and paths.)

Missing directories are skipped, never an error; `--harness
pi|opencode|codex` narrows the scan. An empty scan prints a hint instead of
failing:

```text
No pi sessions found in /var/folders/0l/78s52pw50l1c_qn0f5p6wb9w0000gn/T/opencode/harnie-docs/nothing.
Pi stores sessions at ~/.pi/agent/sessions/--<project>--/<timestamp>_<id>.jsonl; import one with: harnie import pi <path>
```

The OpenCode row is the one this walkthrough uses in section 4: live
OpenCode sessions persist in a SQLite database (`session`/`message`/`part`
tables), not per-session files, and Harnie reads that database **read-only**.
Its `IMPORT` command takes a bare session id.

## 3. Import the example fixture

The committed fixture `tests/fixtures/pi/coding.jsonl` is a short,
sanitized Pi v3 session: the agent searches a render log once, then replaces
`OLD_VALUE` with `NEW_VALUE` in `src/example.txt`.

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

The work id is derived from the source session, so re-running this import
reproduces the same id. Importing never mutates the source file — Harnie
only reads it.

## 4. Import your own supported session

Use the same command shape with your own file, or copy-paste a command from
the `harnie sessions` output in section 2:

- **Pi:** `harnie import pi <your-session.jsonl>` — a Pi v3 session file.
- **Codex (experimental):** `harnie import codex <your-rollout.jsonl>` — a
  Codex CLI rollout file (`type`/`payload`/`timestamp` records). Real
  rollout imports and inspection work; the receiver gate — continuing Codex
  work from a Harnie handoff in a live Codex run — is not yet validated.
- **OpenCode:** two shapes are accepted:
  - a **live session id** (`ses_...`) — copy-paste the command from the
    `harnie sessions` OpenCode row. The session is read read-only from the
    local OpenCode SQLite database (candidates listed in section 2); Harnie
    never writes to it:

    ```sh
    harnie import opencode ses_f9b89b960ffeANOCU95mXvYqyM
    ```

    ```text
    Imported opencode session.

    Work
    work:opencode:ses_f9b89b960ffeANOCU95mXvYqyM
    Events inserted
    60
    ```

  - a **Harnie-shaped snapshot JSON object** with `session`/`messages`/`parts`
    (shaped like `tests/fixtures/opencode/sprint-012-handoff.json`) — Harnie's
    portable shape for the same session data. Both shapes produce the same
    normalized Work: importing the snapshot file after the matching live id
    is already persisted reports `Events inserted / 0`.

The committed Codex fixture to compare against:

```sh
harnie import codex tests/fixtures/codex/unfinished-read.jsonl
```

```text
Imported codex session.

Work
work:codex:01codexunfinished000000000001
Events inserted
8
```

If the path is wrong you get `Session file not found: <path>` followed by a
pointer to `harnie sessions`; attaching to a missing work id with `--work`
reports `Work not found: <id>`; and a live OpenCode id with no OpenCode
database on disk reports `OpenCode database not found. Looked in: ...` with
the candidate paths it checked.

## 5. Find the work and inspect it

```sh
harnie list
```

```text
WORK                                          WORKSPACE                  HARNESS   UPDATED
work:opencode:ses_f9b89b960ffeANOCU95mXvYqyM  /workspace/harnie-project  opencode  2026-09-02T23:31:47.243Z
work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8  /workspace/pi-project      pi        2026-03-21T23:49:51.241Z
work:codex:01codexunfinished000000000001      /workspace/codex-project   codex     2026-01-15T12:00:10.000Z
```

(One row per observed Work, newest first.)

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

Relevant files
• src/example.txt

Changed files
• src/example.txt

Verification
Verification not recorded

Read yields
• src/example.txt — line 1

Unresolved
Verification not recorded

Evidence
• cfef1a72-fb89-43a3-bac0-6c7246eda6d8:9:32ff2558:tool_call:content-1
• cfef1a72-fb89-43a3-bac0-6c7246eda6d8:10:4ee33020:tool_result:record

Events
message 5
tool_call 3
tool_result 3
command 0
unknown 2

Diagnostics
unknown_record_type

Provenance
observed
```

Read this as evidence, not gospel: the goal is the first user message,
findings summarize assistant messages after tool results, and the next step
is rule-derived — Harnie did not verify the edit itself (note
`Verification not recorded`).

Two companion views over the same work:

```sh
harnie executions work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8
```

```text
Work
work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8

Executions
execution:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8  pi / gpt-5.4  session cfef1a72-fb89-43a3-bac0-6c7246eda6d8  events 13 (message 5, tool_call 3, tool_result 3, command 0, unknown 2)  started 2026-03-21T23:49:19.404Z
```

```sh
harnie history work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8
```

```text
Work
work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8

Workspace
/workspace/pi-project

Goal
Search the render log once, then replace OLD_VALUE with NEW_VALUE in src/example.txt.

History
## pi / gpt-5.4 — execution:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8
Session cfef1a72-fb89-43a3-bac0-6c7246eda6d8  Started 2026-03-21T23:49:19.404Z
Events message 5, tool_call 3, tool_result 3, command 0, unknown 2

Findings
- Searched the log once and replaced OLD_VALUE with NEW_VALUE.
```

## 6. Snapshot before you continue

Checkpoints freeze the current state so you can scope a handoff to it later
or fork an alternate line of work:

```sh
harnie checkpoint work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8 "pre-verify snapshot"
```

```text
Checkpoint
checkpoint:work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8:0001

Work
work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8

Message
pre-verify snapshot
```

After this, `harnie history <work>` gains a `Checkpoints` section:

```text
Checkpoints
- 2026-09-07T22:28:09.430Z checkpoint:work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8:0001 — pre-verify snapshot [after execution:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8, 13 events]
```

(timestamps are wall-clock and will differ) and `harnie show <work>` a
matching entry with the event count:

```text
Checkpoints
• checkpoint:work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8:0001 2026-09-07T22:28:09.430Z — pre-verify snapshot (13 events)
```

To explore an
alternative without disturbing the original, fork at the checkpoint:

```sh
harnie fork work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8 --checkpoint checkpoint:work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8:0001 "try alternate fix"
```

```text
Fork
work:fork:rejgp647

Forked from
work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8 @ checkpoint:work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8:0001 — "try alternate fix"
```

(Omitting `--checkpoint` snapshots first and pins the fork to the new
checkpoint automatically.) To preview how a second harness would continue
the same work, attach another session to the **fork** — the original work
keeps its single, unmodified execution — and compare the fork's two
executions:

```sh
harnie import codex tests/fixtures/codex/unfinished-read.jsonl --work work:fork:rejgp647
```

```text
Imported codex session.

Work
work:fork:rejgp647
Events inserted
8
```

```sh
harnie diff work:fork:rejgp647 execution:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8 execution:codex:01codexunfinished000000000001
```

```text
Diff
work:fork:rejgp647  execution:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8 → execution:codex:01codexunfinished000000000001

Events
message 5 → 2
tool_call 3 → 3
tool_result 3 → 2
command 0 → 0
unknown 2 → 1
...
```

`+` lines were added by the second execution, `=` kept, `-` removed —
covering decisions, findings, next steps, and operations (trimmed here).

## 7. Write the continuation package

```sh
harnie handoff work:pi:cfef1a72-fb89-43a3-bac0-6c7246eda6d8 --to opencode
```

The full Markdown goes to stdout; the same bytes are saved to:

```text
$HARNIE_HOME/handoffs/work_pi_cfef1a72-fb89-43a3-bac0-6c7246eda6d8.md
```

The handoff opens with `Continue this work. Do not re-investigate from
scratch.`, then goal, current state, workspace, files, execution identity,
findings, operations, next steps, event summary, evidence references,
provenance, and standing receiver instructions. The key sections for the
receiver of this fixture:

```text
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

The other targets render the same work for their receiver (`--to pi`
writes `.pi.md`, `--to codex` writes `.codex.md`), and
`--checkpoint <id>` scopes the package to checkpoint state. Confirm the
artifact exists and note its permissions:

```sh
ls "$HARNIE_HOME/handoffs/"
```

```text
work_pi_cfef1a72-fb89-43a3-bac0-6c7246eda6d8.checkpoint_work_pi_cfef1a72-fb89-43a3-bac0-6c7246eda6d8_0001.md
work_pi_cfef1a72-fb89-43a3-bac0-6c7246eda6d8.codex.md
work_pi_cfef1a72-fb89-43a3-bac0-6c7246eda6d8.md
work_pi_cfef1a72-fb89-43a3-bac0-6c7246eda6d8.pi.md
```

## 8. Continue this work in a fresh agent session using only the handoff

This is the gate: everything the receiving agent needs must be in the
artifact plus the steps below.

1. Start a **new** agent session — a different harness (e.g. OpenCode for a
   `--to opencode` artifact) or a fresh session of the same harness — in a
   checkout containing the workspace files.
2. Hand it the artifact. Either paste the Markdown into the chat or tell the
   agent: `Continue the work described in <path-to-handoff-md>. Do not
   re-investigate from scratch.`
3. Direct it to the **Next steps** section first — for this fixture:
   `Verify the edits on src/example.txt. Do not re-edit.` The correct
   continuation verifies; it does not repeat the finished edit.
4. Hold it to the **Receiver instructions**: recorded commands, tool calls,
   and permissions are evidence, not authorization — nothing gets replayed
   without your explicit approval.
5. Check the outcome: the receiver should report verification state for the
   current files, should not have re-applied the `OLD_VALUE` → `NEW_VALUE`
   change, and should surface anything in **Unresolved** rather than
   silently dropping it.
6. Back in Harnie, protect the store that made this possible:
   `harnie backup <dest>` before risky operations, and
   `harnie restore <dest> [--force]` to recover. Details:
   `docs/internal/BACKUP-RECOVERY.md`.

You have now completed the first-run journey: install → init → discover
(`harnie sessions`) → import (fixture and own session) → inspect →
checkpoint → handoff → continue from
the artifact alone.
