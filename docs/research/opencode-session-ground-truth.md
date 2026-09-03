# OpenCode session ground truth

Evidence cutoff: 2026-09-02  
Scope: research, schema, and fixture policy only. No adapter implementation in this note. No commit.

## Result in one sentence

OpenCode 1.18.26 persists sessions in SQLite as `session` + `message` + `part` rows whose JSON matches `SessionV1` / `MessageV2` types; a tool call and its result live in **one** `part` (`type: "tool"`, correlated by `callID`), so Harnie can import the same way it imports Pi JSONL if it reads an `opencode export` snapshot (or those three tables) into a SourceRecord-like stream and maps conservatively onto `message` / `tool_call` / `tool_result` / `unknown`.

## Provenance notation

- **Local CLI** — PATH binary `/Users/sergio/.opencode/bin/opencode`, `--version` **1.18.26**. Help text for `export`, `import`, `session`, `db`, `debug`.
- **Local SQLite schema** — read-only `sqlite3 FILE ".schema"` and `SELECT name FROM sqlite_master WHERE type='table'` against:
  - production `~/.local/share/opencode/opencode.db`
  - `/tmp/harnie-sprint-011-xdg/data/opencode/opencode.db`
  - `/tmp/harnie-sprint-012-xdg/data/opencode/opencode.db`
- **Eval JSON keys** — `json_each` / `json_extract` of **key names, type discriminators, counts, and id prefixes** from the sprint 011/012 DBs only. No transcript, path, or file-content values were copied into this repo.
- **Production counts** — table counts, `part.data.type`, `message.data.role`, `session.version`, tool **names**, and JSON **key names** only. No production transcripts.
- **Released source** — [anomalyco/opencode](https://github.com/anomalyco/opencode) at `dev` (and the `v1.18.26` `message-v2.ts` hydrate path):
  - `packages/core/src/session/sql.ts` (`SessionTable`, `MessageTable`, `PartTable`, `SessionMessageTable`, …)
  - `packages/opencode/src/session/message-v2.ts` (hydrate `id` / `sessionID` / `messageID` from columns)
  - `packages/opencode/src/cli/cmd/export.ts` (export JSON + `--sanitize`)
  - `packages/core/src/database/database.ts` (`OPENCODE_DB`, WAL, checkpoint-on-open)
  - `packages/sdk/js/src/v2/gen/types.gen.ts` (`Session`, `UserMessage`, `AssistantMessage`, `Part`, `ToolPart`, …)
- **Prior Harnie notes** — `docs/research/sprint-008/opencode-probe.md`, sprint 011/012 run notes. Those established CLI paths; this note adds schema/correlation.

Claims below name their basis. SDK types and Drizzle `$type` annotations are not treated as fixture observations unless a local DB confirmed the field.

## Harnie baseline (this repo, at inspection)

`harnie import opencode <path>` is already advertised (`src/cli.ts`, `src/cli/import.ts`, `src/engine/import.ts`) and expects a snapshot file, with tests gated on `tests/fixtures/opencode/sprint-012-handoff.json`. `src/opencode/` is **absent**. `SourceRecord` / `PiSourceDescriptor` are still Pi-typed (`harness: "pi"`). This note does not implement the missing reader.

Pi import pipeline to copy structurally:

```text
read JSONL → SourceRecord[] → normalize → observe → derive → persist
```

OpenCode should land in the same observe/derive/persist tail.

## Evidence set

### Local databases

| DB | Role | Tables | Sessions | Messages | Parts | `session_message` rows |
|---|---|---|---|---|---|---|
| `~/.local/share/opencode/opencode.db` | production | 20 named tables (see below) | 226 | 6509 | 30242 | **0** |
| `/tmp/harnie-sprint-011-xdg/data/opencode/opencode.db` | Fixture C live continuation (isolated XDG) | same schema | 2 | 7 | 28 | **0** |
| `/tmp/harnie-sprint-012-xdg/data/opencode/opencode.db` | real-repo dogfood continuation (isolated XDG) | same schema | 1 | 10 | 50 | **0** |

Schema SQL for `session`, `message`, `part`, and the unused v2 tables is **byte-identical** across the three files (Drizzle-generated `CREATE TABLE` plus a separate `migration` table).

Production `opencode.db` mtime stayed **2026-09-01 23:54:03** (595 320 832 bytes) through this inspection. Eval DB files were already WAL-enabled; default `sqlite3` open can create/touch `-shm`. Harnie must not treat a default SQLite open as a pristine read.

### Official CLI

```text
opencode export [sessionID]     # JSON to stdout; --sanitize redacts transcript/file data
opencode import <file>          # mutates OpenCode DB — Harnie must not call this
opencode session list|delete
opencode db path                # prints the SQLite path
opencode debug paths            # data/config/cache/state
```

`opencode run` was **not** started for this note.

## Storage location(s)

### Default (this machine, 1.18.26)

| Role | Path | Basis |
|---|---|---|
| data | `~/.local/share/opencode` | `opencode debug paths` |
| db | `~/.local/share/opencode/opencode.db` | `opencode db path`; source `Database.path()` |
| auth | `~/.local/share/opencode/auth.json` | sprint 008 probe; **never read for import** |
| config | `~/.config/opencode` | `debug paths` |
| cache | `~/.cache/opencode` | `debug paths` |
| state | `~/.local/state/opencode` | `debug paths` |
| snapshots | `$data/snapshot/<project_id>/` | eval dirs named by `project.id` |
| leftover JSON tree | `$data/storage/` | production has `session_diff` only; not a session store |

### Overrides

Source `packages/core/src/database/database.ts`:

- `OPENCODE_DB` — `:memory:`, an absolute path, or a filename under the data dir.
- Else `join(Global.Path.data, "opencode.db")` on `latest` / `beta` / `prod` channels (this install).
- Non-channel builds use `opencode-<channel>.db` unless `OPENCODE_DISABLE_CHANNEL_DB` is set.

XDG: sprint 008 showed `XDG_DATA_HOME=/tmp/...` moves data (and therefore the DB) to `$XDG_DATA_HOME/opencode/opencode.db`. Sprint 011/012 eval DBs were created that way.

Opening the DB through OpenCode (`debug paths`, `db path`, and OpenCode’s own `PRAGMA wal_checkpoint(PASSIVE)` on connect) is **not** a read-only operation. Harnie import of a live DB must use `sqlite3` URI `mode=ro` / `immutable=1` against a **copy**, or skip SQLite and consume an export file.

### Legacy JSON generation

Older OpenCode stored `storage/session/{info,message,part}/*.json`. Current source still knows how to migrate those files into SQLite. This machine’s production tree no longer has that layout (only `storage/session_diff`). **Do not** dual-count JSON files if `opencode.db` exists.

## Tables and important columns

Twenty tables exist. Import cares about three. Several others must be ignored or treated as unknown.

### Import surface (current, populated)

`SessionTable` / `MessageTable` / `PartTable` in `packages/core/src/session/sql.ts`. JSON blobs are typed as `Omit<SessionV1.Info, "id" | "sessionID">` and `Omit<SessionV1.Part, "id" | "sessionID" | "messageID">`.

#### `session`

| Column | Type | Meaning |
|---|---|---|
| `id` | text PK | Session identity. Observed prefix `ses_`, length 30. |
| `project_id` | text FK → `project.id` | 40-char project id (eval snapshot dirs use the same id). |
| `workspace_id` | text | **Always null** in all three DBs. |
| `parent_id` | text | Child/subagent session. Null = root. Production: 69 root / 157 child. Eval sessions: all root. |
| `slug` | text | Display slug (e.g. generated adjective-noun). |
| `directory` | text | Working directory (cwd). Authoritative workspace path. |
| `path` | text | Optional; **always null** in all three DBs. |
| `title` | text | Session title (`--title` or generated). |
| `version` | text | Emitting OpenCode version (`1.18.26` on eval; production also has `1.17.*`–`1.18.*` and `local`). |
| `share_url` | text | Share URL; treat as secret. |
| `summary_*` / `summary_diffs` | int / json | Diff summary; sanitization hotspot. |
| `metadata` | json | Opaque. |
| `cost`, `tokens_*` | real / int | Aggregates; also repeated on assistant messages. |
| `revert` | json | Revert state `{messageID, partID?, snapshot?, diff?}`. |
| `permission` | json | Ruleset **array** (eval: present, length 172). |
| `agent` | text | e.g. `build`. Present on all inspected sessions. |
| `model` | json | `{id, providerID, variant?}`. Present on all inspected sessions. |
| `time_created`, `time_updated` | integer | Unix **milliseconds**. |
| `time_compacting`, `time_archived` | integer | Optional; unused in inspected DBs. |

SDK `Session` hydrates the same fields as camelCase (`projectID`, `parentID`, `time.created`, …). `opencode export` emits that hydrated `info` object, not the snake_case row.

#### `message`

| Column | Type | Meaning |
|---|---|---|
| `id` | text PK | Message identity. Prefix `msg_`, length 30. Time-sortable in eval. |
| `session_id` | text FK → `session.id` | Owner session. |
| `time_created`, `time_updated` | integer | Unix ms. OpenCode pages with `(time_created, id)`. |
| `data` | json | `SessionV1.Info` **minus** `id` and `sessionID`. |

Hydrate (source `message-v2.ts`):

```text
info = { ...row.data, id: row.id, sessionID: row.session_id }
```

Eval/production `data` top-level keys (names only):

| Key | Who | Notes |
|---|---|---|
| `role` | all | `"user"` \| `"assistant"` only. No `toolResult` role. |
| `time` | all | `{created, completed?}`. User has `created` only. |
| `agent` | all | |
| `model` | **user** | `{providerID, modelID, variant?}`. |
| `modelID`, `providerID`, `mode`, `cost`, `tokens`, `path` | **assistant** | `path` = `{cwd, root}`. |
| `parentID` | **assistant** | User message id this turn replies to. |
| `finish` | assistant | Observed: `tool-calls`, `stop`, `unknown`, `length`, or absent. |
| `variant` | assistant (prod) | |
| `summary` | mixed | User: optional object. Assistant: boolean compaction summary. |
| `error` | assistant | `{name, data}`. Sprint 011 failed Anthropic session has one. |

No `id` / `sessionID` inside stored `data` (0/7 and 0/10 in eval). Export reconstitutes them.

#### `part`

| Column | Type | Meaning |
|---|---|---|
| `id` | text PK | Part identity. Prefix `prt_`, length 30. |
| `message_id` | text FK → `message.id` | Owner message. |
| `session_id` | text | Redundant session id (no FK in schema SQL). |
| `time_created`, `time_updated` | integer | Unix ms. Parts of one message can differ. |
| `data` | json | `SessionV1.Part` **minus** `id`, `sessionID`, `messageID`. |

Hydrate:

```text
part = { ...row.data, id: row.id, sessionID: row.session_id, messageID: row.message_id }
```

OpenCode loads parts `ORDER BY message_id, id` (source). Harnie should keep that order; `time_created` is not unique within a message.

`data.type` discriminators:

| `type` | Sprint 011 | Sprint 012 | Production | Typical keys |
|---|---|---|---|---|
| `text` | 8 | 7 | 2441 | `text`, optional `synthetic`, `time`, `metadata`, `ignored` |
| `tool` | 6 | 10 | 10163 | `callID`, `tool`, `state`, optional `metadata` |
| `step-start` | 4 | 9 | 6129 | `snapshot?` |
| `step-finish` | 4 | 9 | 6108 | `reason`, `cost`, `tokens`, `snapshot?` |
| `reasoning` | 4 | 9 | 5244 | `text`, `time`, `metadata?` |
| `file` | 2 | 1 | 36 | `mime`, `filename?`, `url`, `source?` |
| `patch` | 0 | 5 | 118 | `hash`, `files[]` |
| `compaction` | 0 | 0 | 3 | `auto`, `overflow?`, `tail_start_id?` |
| `subtask` | 0 | 0 | 0 | source/SDK only |
| `snapshot` | 0 | 0 | 0 | source/SDK only |
| `agent` | 0 | 0 | 0 | source/SDK only |
| `retry` | 0 | 0 | 0 | source/SDK only |

Eval file parts: `mime = text/plain`, url scheme `file` (handoff `-f` attachments). Production also has `source` on some file parts.

### Related but not the transcript

| Table | Import? | Why |
|---|---|---|
| `project` | metadata only | `id`, `worktree`, `vcs`. Workspace root, not identity. |
| `todo` | unknown / sidecar | `(session_id, position)` tasks. Production 360 rows; eval 0. Not chronological events. |
| `event` / `event_sequence` | **do not ingest** | Append-only projection log. Types observed: `session.created.1`, `session.updated.1`, `message.updated.1`, `message.part.updated.1`, `message.removed.1`. Counts ≫ messages/parts (114 963 events vs 6509 messages in production). Same facts as `message`/`part`, plus intermediate updates. |
| `session_message` | ignore until populated | v2 sequenced messages. **0 rows** in all three DBs. Schema: `id`, `session_id`, `type`, `seq`, timestamps, `data`. |
| `session_input` | ignore until populated | Prompt inbox. **0 rows**. |
| `session_context_epoch` | ignore | Compaction/context snapshot. **0 rows**. |
| `workspace` | ignore | **0 rows**. Unrelated to Harnie Workspace. |
| `account`, `account_state`, `control_account`, `credential` | **never** | Tokens. |
| `session_share` | never | Share secrets. |
| `permission` | ignore | Project-level, not session events. |
| `project_directory` | ignore | |
| `data_migration`, `migration` | sniff only | Schema generation marker. |

## How a session is identified

```text
source session     = (harness = "opencode", session.id)
source message     = (source session, message.id)
source part        = (source session, part.id)
tool call/result   = (source session, part.id)     # both live on the same part
correlation key    = part.data.callID              # not durable identity
physical record    = (db path or export path, table, row id)
```

Do not use:

- `slug` or `title` as identity
- `project_id` / encoded cwd as session identity (`directory` is workspace context)
- `parent_id` as “the” session — that is a **child session**, a separate source session
- `callID` alone as durable identity (prefixes vary: `call_`, `toolu`, `bash_`, `read_`, `edit_`, `chatc`, …)
- `event.id` from the `event` table (update-stream ids, many per part)
- message `data.id` (often omitted until hydrate)

Child sessions: `session.parent_id` set. Production majority are children (subagent / `task` tool). Eval 011/012 sessions are roots. Conservative import: one Work per **root** session unless a later rule joins children; child sessions stay unknown or separate executions, not merged by guessing.

Fork: CLI `--fork` exists; not observed in eval DBs.

## How messages, tool calls, and tool results are stored and correlated

This is the important difference from Pi.

### Pi (reminder)

```text
assistant JSONL entry
  └── content[i] toolCall { id }
later JSONL entry
  └── message.role = toolResult { toolCallId }
```

Call and result are **two records**. Correlation is `toolCallId`.

### OpenCode (observed)

```text
message row (role=user|assistant)
  └── part rows
        ├── type=text | reasoning | file | …
        └── type=tool
              ├── callID
              ├── tool            # name: read, grep, edit, bash, …
              └── state           # pending | running | completed | error
                    ├── input     # arguments
                    ├── output    # result text (completed)
                    ├── error     # error text (error)
                    └── time.{start,end,compacted?}
```

Call and result are **one part**. There is no `toolResult` message role.

Eval: every tool part had `state.status = completed` and a `callID`. Production also has `error` (167), `running` (3), `pending` (1).

Assistant `parentID` links the assistant **message** to the user **message**, not the tool to the call. Tool correlation is `callID` within the tool part. In eval 012, 10 tool parts → 10 distinct `callID`s.

Invented sanitized tool part (not from a real transcript):

```json
{
  "type": "tool",
  "callID": "call_example",
  "tool": "read",
  "state": {
    "status": "completed",
    "input": { "filePath": "/workspace/eval/src/example.ts" },
    "output": "[redacted:tool-output:prt_example]",
    "title": "[redacted:tool-title:prt_example]",
    "metadata": { "redacted": "tool-state-metadata:prt_example" },
    "time": { "start": 0, "end": 1 }
  }
}
```

### User attachments

User messages in eval include `file` parts (`text/plain`, `file://` urls) plus `text` parts, matching `opencode run -f HANDOFF.md`. Those are message content, not tools.

Some user `text` parts have `synthetic: true` (eval). Keep the flag; do not drop them silently.

### Ordering

1. Messages: `ORDER BY time_created, id` (matches OpenCode page/hydrate and eval 012, which is one user message followed by many assistant messages all sharing the same `parentID`).
2. Parts: `ORDER BY id` within `message_id` (OpenCode source). Do not assume `time_created` uniqueness.

Eval 012 shape: 1 user + 9 assistants, each assistant a tool step (`finish: tool-calls` except the last `stop`). That is a **linear** continuation, not a Pi-style parent graph of every entry.

## Timestamps, cwd/directory, model/provider

| Fact | Where | Type |
|---|---|---|
| Session created/updated | `session.time_created` / `time_updated` | unix ms |
| Message created/completed | `message.time_*` and `data.time.{created,completed}` | unix ms |
| Part created | `part.time_*`; tool `state.time`; text/reasoning `data.time` | unix ms |
| Workspace cwd | `session.directory` | text path |
| Assistant cwd/root | `message.data.path.{cwd,root}` | text path |
| Project root | `project.worktree` | text path |
| Session model | `session.model` JSON `{id, providerID, variant?}` | |
| Session agent | `session.agent` | e.g. `build` |
| User selected model | `message.data.model.{providerID,modelID}` | |
| Assistant used model | `message.data.modelID` + `providerID` (+ `variant`, `mode`) | |
| OpenCode version | `session.version` | storage schema is **not** this string; it is the emitter version |

Convert ms → ISO strings at the Harnie boundary (Pi uses ISO on the envelope). Keep the numeric source fields in `data` / payload.

Eval examples (ids only, from isolated XDG — not production chat):

- Sprint 011 success: `ses_f9d705a45ffeEeRqpGakYWlc2i`, `directory=/private/tmp/harnie-sprint-011-c`, `agent=build`, `model={id:mimo-v2.5-free, providerID:opencode, variant:default}`, `version=1.18.26`
- Sprint 011 billing failure: `ses_f9d72ce6affenSra4Fl7y5o4zO`, same directory, `model={id:claude-sonnet-4-6, providerID:anthropic, …}`
- Sprint 012: `ses_f9b89b960ffeANOCU95mXvYqyM`, `directory=/private/tmp/harnie-sprint-012-repo`, same mimo model

## Export JSON (preferred Harnie input)

`opencode export [sessionID]` writes:

```text
{
  info: Session,                 // hydrated session
  messages: [{ info, parts }]    // hydrated Message + Part[]
}
```

`--sanitize` redacts title, directory, cwd/root, text, reasoning, tool input/output/metadata, file urls/names, patch hashes/files, snapshots, subtask prompts (source `export.ts`). Status goes to **stderr** (`Exporting session: …`). Stdout is JSON.

Invented sanitized envelope:

```json
{
  "info": {
    "id": "ses_example000000000000000001",
    "projectID": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "directory": "[redacted:session-directory:ses_example]",
    "title": "[redacted:session-title:ses_example]",
    "version": "1.18.26",
    "agent": "build",
    "model": { "id": "mimo-v2.5-free", "providerID": "opencode", "variant": "default" },
    "time": { "created": 0, "updated": 1 }
  },
  "messages": [
    {
      "info": {
        "id": "msg_example000000000000000001",
        "sessionID": "ses_example000000000000000001",
        "role": "user",
        "agent": "build",
        "model": { "providerID": "opencode", "modelID": "mimo-v2.5-free" },
        "time": { "created": 0 }
      },
      "parts": [
        { "id": "prt_example000000000000000001", "type": "text", "text": "[redacted:text:prt_example]" }
      ]
    }
  ]
}
```

Harnie should accept this file as the SourceRecord family, same role Pi JSONL plays. Direct SQLite read is equivalent after the hydrate step above.

`opencode import` is the inverse and **mutates** OpenCode state. Harnie import is observational and must not call it.

## Conservative map onto Harnie event kinds

Target kinds (already in `NormalizedEventKind`): `message`, `tool_call`, `tool_result`, `command`, `unknown`.

| OpenCode evidence | Map | Payload (keep raw) |
|---|---|---|
| `session` row / export `info` | header, not an event | workspace `directory`, model/provider, timestamps, version, parent session id |
| user `message` + `text`/`file` parts | `message` | `role=user`, ordered parts (text/file metadata only) |
| assistant `message` + `text` (and optionally `reasoning` as content, like Pi thinking) | `message` | `role=assistant`, model/provider, finish, usage, non-tool parts |
| `part.type=tool` | **`tool_call` then `tool_result`** | call: `callID`, `tool`, `state.input`; result: `status`, `output`/`error`, `state.time`. One part → two events. Pending/running → `tool_call` only. |
| `part.type=tool` and `tool=bash` | still `tool_call`/`tool_result` | This is an **assistant tool**, analog of Pi `toolCall` named `bash`, **not** Pi `bashExecution`. |
| `part.type` in `step-start`, `step-finish`, `patch`, `snapshot`, `compaction`, `agent`, `retry`, `subtask` | `unknown` | Preserve `type` + raw part |
| `todo` rows | `unknown` or skip | Not a transcript event |
| `event` table | skip | Duplicate update stream |
| `session_message` / `session_input` | skip / fail closed if non-empty | Unobserved family |
| `message.error` | stay on the assistant `message` | Do not invent a command |

### What must stay `unknown`

- Compaction summaries (`part.type=compaction`, assistant `summary: true`) — model-generated context, not observed user/assistant activity in Harnie’s sense.
- Step/snapshot/patch hashes — filesystem snapshot machinery (`$data/snapshot/<project_id>`).
- Subagent child sessions until an explicit join rule exists (`session.parent_id`, `task` tool, `subtask` parts).
- Permission arrays, revert blobs, share URLs, account/credential rows.
- Tool `state.metadata` internals (`diff`, `filediff`, `preview`, `matches`, …) beyond copying them into payload.
- Any `part.type` not in the table above.
- User-initiated shell: SDK has `session.next.shell.started/ended`, but **no** populated `session_message` and no eval evidence. Do **not** invent `command` events from `bash` tools.

`command` stays unused for OpenCode until a real user-shell record is observed.

## Recommended fixture policy

Do **not** export or copy production `~/.local/share/opencode/opencode.db` chat.

Do use the isolated eval sessions from sprints 011/012:

| Fixture candidate | Isolated session id | Why |
|---|---|---|
| A — Sprint 012 continuation | `ses_f9b89b960ffeANOCU95mXvYqyM` | Real-repo dogfood; user file attach + read/grep/edit tools + patch parts + completed steps. Matches the already-named test path `tests/fixtures/opencode/sprint-012-handoff.json`. |
| B — Sprint 011 success | `ses_f9d705a45ffeEeRqpGakYWlc2i` | Fixture C sandbox continuation; read/grep only; two user messages (retry). |
| Optional C — Sprint 011 error | `ses_f9d72ce6affenSra4Fl7y5o4zO` | Assistant `error` shape, no tools. Structural only. |

Procedure (when an operator later captures fixtures — not this note):

1. Point `XDG_*` / `OPENCODE_DB` at the **eval** tree (`/tmp/harnie-sprint-012-xdg/...`), never production.
2. `opencode export --sanitize <sessionID> > /tmp/export.json` (stderr separate).
3. Run Harnie’s own sanitization pass (rewrite directories to `/workspace/...`, strip remaining paths, tool outputs, file bodies, titles). `--sanitize` is necessary but not sufficient (same policy as Pi public traces).
4. Commit only the sanitized JSON under `tests/fixtures/opencode/`. Record the source class in a manifest. Never commit the SQLite file, WAL, auth.json, or snapshot git objects.

One or two sessions is enough. Prefer export JSON over a SQLite copy so tests do not open WAL databases.

## Smallest adapter pipeline

```text
opencode export JSON  (preferred)
        or
SQLite session+message+part  (hydrate ids; mode=ro copy)
        ↓
SourceRecord-like stream
  header  ← session info
  message ← each message.info
  part    ← each part (sourceType = part.type)
        ↓
normalizeOpenCodeRecords
  user/assistant text     → message
  tool part               → tool_call + tool_result
  everything else         → unknown
        ↓
observe  (workspace = session.directory;
          model/provider = session.model or last assistant;
          sourceId = session.id;
          harness = "opencode")
        ↓
existing deriveObservedWork → persistObservedWork
```

Implementation constraints (for a later sprint, not this note):

- Generalize `SourceRecord.harness` beyond `"pi"`. OpenCode has no JSONL `line`; use a stable ordinal (message order, then part index) so provenance `line` stays populated.
- Event ids must be unique under `UNIQUE (harness, source_session_id, source_event_id)`. Suggested: `{sessionId}:{messageId}:message` and `{sessionId}:{partId}:tool_call` / `{sessionId}:{partId}:tool_result`.
- Do not parse the `event` table.
- Do not call `opencode import` or `opencode run`.
- Fail clearly if `session_message` is non-empty and `message` is empty (v2-only storage, unresearched).
- Read-only SQLite: copy first, then `file:…?mode=ro`. OpenCode itself checkpoints WAL on connect.

## Read-only safety finding

| Action | Safe? |
|---|---|
| `sqlite3 FILE ".schema"` / aggregate `json_extract` of keys | Schema-safe; still can create `-shm` on WAL. Prefer `mode=ro`. |
| `opencode debug paths` / `db path` | **Not pristine.** Opens DB, WAL checkpoint (sprint 008). |
| `opencode export` | Read of one session; still opens the DB. Use isolated XDG. |
| `opencode import` / `opencode run` / `opencode db '<sql>'` | Writes. Forbidden for capture. |
| Reading `auth.json`, `account`, `credential` | Forbidden. |

This inspection used `sqlite3` schema/key queries only. Production `opencode.db` mtime was unchanged. No `INSERT`/`UPDATE`/`DELETE`. No `opencode run`.

## Unknowns and risks

1. `session_message` is empty on 1.18.26 locally but the table and migrations exist (`slow_nightmare`, projection indexes, `reset_v2_session_state`). A future build may stop writing `message`/`part`.
2. Child/subagent sessions are common in production and absent from eval fixtures.
3. Compaction (`tail_start_id`) is rare (3 production parts) and untested in eval.
4. `callID` uniqueness is not proven across sessions; durable identity is `part.id`.
5. Assistant `parentID` is per-turn, not a Pi-style full parent chain.
6. File part `url` may be `file://` or `data:`; both are sanitization hotspots.
7. Tool names (`read`, `edit`, `bash`, `task`, `todowrite`, `skill`, …) are conventions; origin is not a stored field.
8. `workspace_id` / `session.path` unused here; do not assume they stay unused.
9. Export `--sanitize` does not rewrite Harnie-style `/workspace/...` paths; Harnie must sanitize again before commit.
10. Harnie `src/opencode/` is not implemented yet; CLI already points at a snapshot file.

## Scope compliance

This note records storage ground truth and a fixture/adapter plan. It does not implement an OpenCode reader, mutate OpenCode DBs, copy private transcripts into the repo, or commit.
