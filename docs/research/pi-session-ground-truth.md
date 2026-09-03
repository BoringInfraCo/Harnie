# Pi session ground truth

Evidence cutoff: 2026-09-01  
Sprint: 001 — Pi Session Ground Truth  
Scope: research, evidence, and fixture foundation only

## Result in one sentence

Current Pi CLI sessions persist enough structured version-3 JSONL evidence for conservative chronological/tool normalization and provenance-backed semantic derivation. Public fixtures A–D and local traces E–F now agree on that v3 shape, so Sprint 002 is **GO**. Semantic Work State remains a later derivation problem, not an ingest problem.

## Provenance notation

- **Documentation** — current official Pi documentation.
- **Released source** — `@earendil-works/pi-coding-agent` v0.84.3 at commit [`4e58f324`](https://github.com/earendil-works/pi/commit/4e58f324fae8ebfa98a3d45181fb248072a2afac).
- **Main source** — upstream `main` at commit [`6c87d9a`](https://github.com/earendil-works/pi/commit/6c87d9a026677b601e8278030dcf1ad97fe0bd86).
- **Fixture evidence** — sanitized derivatives under `tests/fixtures/pi/`, sourced from maintainer-published traces at dataset revision [`dac2a1d`](https://huggingface.co/datasets/badlogicgames/pi-mono/tree/dac2a1d3ba12dda597b973a791a77618ccb5f413).
- **Local inspection** — read-only filesystem, environment, shell configuration, and installation discovery on this machine.

Claims below name their basis explicitly. Documentation and source are not treated as fixture observations.

## Repository baseline

Before Sprint 001 changes:

- `main` matched `origin/main` at the single initial commit `607c744`.
- `README.md` contained one sentence.
- There was no package manifest, implementation, parser, database, CLI, or test suite.
- The four governing documents existed under `docs/internal/` but were untracked, as was `.history/`.
- No `AGENTS.md` was present in the repository.

This sprint does not alter the untracked `.history/` directory and does not introduce production adapter code.

Basis: **local inspection** using `git status`, `git log`, and repository file enumeration.

## Evidence set

### Official documentation

- [Sessions](https://pi.dev/docs/latest/sessions)
- [Session Format](https://pi.dev/docs/latest/session-format)
- [Compaction](https://pi.dev/docs/latest/compaction)
- [Settings](https://pi.dev/docs/latest/settings)
- [Environment Variables](https://pi.dev/docs/latest/environment-variables)

These pages are unversioned `latest` documentation. Source claims are therefore pinned separately.

### Official source

- [Version-3 SessionManager types and behavior](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/session-manager.ts)
- [Coding-agent message extensions](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/coding-agent/src/core/messages.ts)
- [Base message, tool, and usage types](https://github.com/earendil-works/pi/blob/4e58f324fae8ebfa98a3d45181fb248072a2afac/packages/ai/src/types.ts)
- [Current configuration paths](https://github.com/earendil-works/pi/blob/6c87d9a026677b601e8278030dcf1ad97fe0bd86/packages/coding-agent/src/config.ts)
- [Emerging version-4 harness session types](https://github.com/earendil-works/pi/blob/6c87d9a026677b601e8278030dcf1ad97fe0bd86/packages/agent/src/harness/session/types.ts)

### Real-session evidence

Sprint 001 found no local Pi sessions, so fixtures A–D were derived from maintainer-published public traces. Sprint 002 later captured two real local v3 sessions read-only and committed them only as sanitized derivatives E–F. The exact source class, selection boundary, and sanitization transformations are recorded in `tests/fixtures/pi/manifest.json`.

The public dataset itself says traces were deterministically redacted and reviewed before upload, but Harnie applies an additional sanitization pass because public status is not a security boundary.

Basis: **fixture evidence** and the [dataset description](https://huggingface.co/datasets/badlogicgames/pi-mono).

## Local Pi storage inspection

Sprint 001 read-only discovery found no populated session store (local session count **0**).

Sprint 002 later captured two real local Pi v3 sessions without using Pi's loader:

- Trace A / fixture E: 31-record coding-adjacent sandbox probe from `~/.pi/agent/sessions/`
- Trace B / fixture F: 13-record unfinished investigation from a disposable workspace, ending on a tool call with no result

Committed files are sanitized derivatives only. Original private session files were not added to the repository. Installed Pi package version remains unknown from the v3 header.

Local session count represented in fixtures: **2**.

Basis: **local inspection** plus **fixture evidence**. No files were opened through Pi APIs, written, migrated, or copied.

## Storage and discovery behavior

| Claim | Finding | Basis |
|---|---|---|
| Default root | Sessions default beneath `~/.pi/agent/sessions/`. | Documentation; released source |
| Default layout | Default sessions are bucketed by resolved working directory as `--<encoded-cwd>--/<timestamp>_<session-id>.jsonl`. | Documentation; released source |
| CWD encoding | The leading path separator is removed, then `/`, `\\`, and `:` become `-`. The encoding is not reversible or collision-free; the header `cwd` is authoritative. | Released source |
| Agent-root override | `PI_CODING_AGENT_DIR` moves the agent/config root. | Documentation; main source |
| Session-root precedence | `--session-dir` overrides `PI_CODING_AGENT_SESSION_DIR`, which overrides settings `sessionDir`. | Documentation; main source |
| Custom-root layout | An explicit/custom session directory is passed directly to SessionManager rather than necessarily receiving the default CWD bucket. Discovery must inspect headers and not assume one layout. | Released/main source |
| File existence | A new session file is not flushed until an assistant message exists. User-only abandoned work may leave no persisted file. | Released source |
| Format version | The v3 header identifies the storage schema, not the exact emitting Pi package version. | Released source; fixture evidence |

## File, identity, and ordering model

### Header

The first physical line is metadata, not a tree node:

```text
session
├── version: 3
├── id: session-scoped UUID-like identifier
├── timestamp: ISO string
├── cwd: startup working directory
└── parentSession?: source file path
```

New session IDs are UUIDv7 in current source. `parentSession`, when present for fork/clone flows, is a local path and must not be treated as durable cross-machine identity.

Basis: **documentation**, **released source**, and fixture headers.

### Entries

Every non-header v3 record contains:

```text
type
id
parentId
timestamp
```

Entry IDs are normally collision-checked eight-character hexadecimal strings, with a full UUID fallback. They must be parsed as opaque strings, not as a fixed-width type. Fork/clone behavior can copy historical entry IDs into a new session, so stable source-event identity is the tuple `(source session ID, entry ID)`, not entry ID alone.

Basis: **documentation** and **released source**; fixtures confirm eight-character IDs and parent links.

### Two kinds of order

- Physical JSONL line order is append chronology.
- Logical conversation order is the `parentId` chain from a chosen leaf.

They are equal in the supplied linear fixtures but need not be equal in a branched session. The most recently appended record becomes the reloaded leaf. A `/tree` navigation with no summary and no subsequent append does not durably record the newly viewed leaf.

Harnie must retain source line number and the parent graph. Sorting only by timestamp or replaying all physical lines as one conversation would be wrong.

Basis: **documentation** and **released source**. No branched trace was captured in the fixture set.

## Messages, tools, timestamps, and usage

### Message envelope

Top-level `message` entries wrap a nested `AgentMessage`. The outer entry has an ISO timestamp; the nested message has a Unix-millisecond timestamp. Both must be retained because they are distinct persisted fields.

Fixture A confirms user and assistant envelopes, ordered content blocks, assistant provider/model, usage/cost, stop reason, and both timestamp forms.

Basis: **documentation**, **released source**, and **Fixture A**.

### Assistant output

Assistant content is an ordered array of blocks. Current base blocks include text, thinking, and tool calls. Current source permits additional provider metadata such as signatures, response IDs/models, diagnostics, deferred/error metadata, and raw stop reasons beyond the simplified documentation examples.

Harnie must preserve unknown content blocks and fields, even when it does not project them into a normalized concept.

Basis: **documentation** and **released source**; Fixtures A–C contain text/thinking/tool-call shapes after sanitization.

### Tool calls and results

A tool call is not a top-level session record. It is a block inside an assistant message:

```text
assistant message entry
└── content[index]
    └── toolCall { id, name, arguments, ... }
```

A result is a later top-level `message` whose nested role is `toolResult`. Correlation uses `message.toolCallId`, not entry `parentId`. Pi does not validate provider call-ID uniqueness, so durable source identity is the assistant entry plus content-block index; the provider ID remains a correlation key. A single assistant message can contain multiple calls, followed by multiple result entries.

Fixture C demonstrates two bash calls in one assistant message and two separately correlated result messages. Fixture B demonstrates bash, read, and edit calls with results.

Basis: **documentation**, **released source**, and **Fixtures B/C**.

### Direct shell execution

Manual `!`/`!!` shell activity persists as a `message` with nested role `bashExecution`, containing command, output, exit/cancellation/truncation fields, optional overflow path, and `excludeFromContext`. It is structurally different from an assistant `bash` tool call plus `toolResult`.

This role was encountered in a real public trace during fixture selection but is not included in the four committed fixtures.

Basis: **released source** and inspected public trace `2026-01-18T11-13-14-021Z_472cf2fa-ab5b-49be-9c1a-42c0c5978980.jsonl` at dataset revision `dac2a1d`.

### Usage

Assistant messages persist input/output/cache token counts and cost components. Current source also permits optional reasoning/cache-write variants. Tool results, compactions, and branch summaries may have their own usage records. Tool-result usage is not automatically equivalent to primary model-conversation usage.

Basis: **documentation**, **released source**, and Fixtures A–D for assistant usage.

## Model and reasoning changes

`model_change` and `thinking_level_change` are top-level tree entries. Model/provider are also repeated on assistant messages. Runtime restoration scans the active branch and lets later model evidence win.

Fixture D contains two consecutive `model_change` entries before the first user message. The assistant's model matches the second transition, establishing that initial settings records can themselves form a transition sequence.

Basis: **documentation**, **released source**, and **Fixture D**.

## Compaction, branching, and extensions

### Version-3 compaction

Released v3 source defines a `compaction` entry with summary, `firstKeptEntryId`, `tokensBefore`, and optional details/usage/hook provenance. Old records remain physically present; the context builder uses the latest compaction plus a kept range and later active-path entries.

Basis: **released source** and the official [Compaction](https://pi.dev/docs/latest/compaction) page. No committed fixture contains a compaction entry.

### Branch summary

A `branch_summary` record uses:

- `parentId` for the branch target/new attachment point;
- `fromId` for the abandoned previous leaf;
- `summary` for model-visible context from the abandoned branch.

Basis: **documentation** and **released source**. No committed fixture contains a branch summary.

### Extension and metadata records

- `custom` stores extension-owned opaque state and is excluded from LLM context.
- `custom_message` stores extension-injected content and participates in context.
- `label` appends a label mutation targeting another entry.
- `session_info` appends session metadata such as display name.

Labels and session-info records were encountered in the wider public inspection pool; custom/custom-message records were not encountered and remain documentation/source-only evidence.

Basis: **documentation**, **released source**, and public inspection pool where stated.

## Documentation/source disagreements

These discrepancies are intentionally not reconciled into one claim.

### `retainedTail`

The current Session Format page says newer compactions embed `retainedTail`. Released v0.84.3 and current `main` version-3 `SessionManager` neither define nor consume that field and still require `firstKeptEntryId`.

Current `main` separately contains an emerging version-4 AgentHarness JSONL design whose compactions do use `retainedTail`. That parallel implementation explains the mixed documentation but is not evidence that the current Pi CLI emits v4.

Decision: treat v3 `firstKeptEntryId` as current CLI source behavior; preserve `retainedTail` if encountered but classify it as unknown/forward-compatible until real CLI evidence establishes its family.

Basis: **documentation versus released/main source**.

### Entry timestamp type

The Compaction documentation includes snippets typing an entry timestamp as numeric. Session Format, version-3 source, and fixtures use ISO strings for outer entry timestamps; nested message timestamps are numeric epoch milliseconds.

Decision: preserve both fields with their observed types and report invalid variants rather than coercing silently.

Basis: **documentation conflict**, **released source**, and fixtures.

### “Auto-save” timing

Documentation says sessions auto-save. Source delays physical creation until an assistant message exists.

Decision: document the operational nuance; absence of a file does not prove no prompt/session was started.

Basis: **documentation versus released source**.

## Emerging version-4 format risk

Current upstream source contains a second, parallel session design under AgentHarness:

- header uses `kind: "header"`, `version: 4`, `createdAt`, and optional `parentSessionId`/metadata;
- mutations carry consecutive `seq` values;
- mutation kinds include entry, record, lane, and fact;
- explicit lane/leaf and operation/tool/usage records exist;
- compaction uses retained-tail state.

The current CLI entry points and public coding-agent SDK still instantiate version-3 SessionManager, and the real public traces used here are v3. Version 4 is therefore an emerging format risk, not an encountered Pi CLI record model.

Sprint 002 should sniff the header family before parsing and fail explicitly on unsupported versions.

Basis: **main source** only.

## Read-only safety finding

Pi's own loaders are not suitable for pristine evidence capture:

- current-main version-3 `loadEntriesFromFile()` can append a missing final newline;
- released/current `SessionManager.open()` can migrate and rewrite version-1/2 sessions;
- version-4 storage can repair incomplete tails during load.

Original session inspection must use ordinary read-only filesystem operations, a generic JSONL reader, and copies for any transformation. Recorded commands and tool permissions are data, not authorization to replay them.

Basis: **main source** for newline repair and version-4 tail repair; **released/main source** for migration rewrites.

## Fixture observations

| Fixture | Real source selection | Observed evidence after sanitization |
|---|---|---|
| A — Minimal | Complete public trace | Header, initial model/reasoning settings, user/assistant messages, content blocks, usage, two timestamp forms |
| B — Coding | Complete public trace | Calls named bash/read/edit with built-in-shaped arguments, correlated tool-reported results, call IDs, ordered parent chain, completion message |
| C — Stateful | Append-valid prefix of a public trace | Goal, two-call investigation, finding in tool output, stated implementation decision, two edit-named calls reporting success, verification not yet performed at the captured prefix; the original session later continued |
| D — Structural edge | Append-valid prefix of a public trace | Two model transitions and assistant model agreement with the later transition |

No fixture claims to demonstrate branching, compaction, custom entries, custom messages, labels, session info, forking, parent-session paths, images, malformed JSON, orphan IDs, or version migration.

## Unknowns and risks

1. Local Pi behavior remains unvalidated because this machine has no local sessions or installed Pi version.
2. The public dataset is real but pre-redacted; its upload pipeline may have removed records or fields relevant to private/local sessions.
3. The session header does not record emitter package version.
4. Entry IDs are session-scoped and may be copied across forks.
5. `parentSession` is a path, not durable source-session identity.
6. Default CWD directory encoding can collide.
7. Physical append order is not the same as an active branch path.
8. A navigation-only leaf change may not persist.
9. Parser behavior in Pi is permissive: malformed lines can be skipped and schemas are not fully validated.
10. Unknown top-level records, content blocks, tool arguments, result details, and extension payloads can appear.
11. Shell commands can read or mutate files opaquely; their file effects are not safely inferred from the command string alone.
12. Overflow-output paths are transient references, not durable embedded artifacts.
13. Repository URL, branch, revision, environment, system prompt, loaded context files, and active tool set are not stable v3 header fields.
14. Goals, decisions, findings, unresolved work, and next steps are not first-class v3 records; they require evidence-linked derivation.
15. Provider signatures, response IDs, thinking, tool text, images, errors, custom data, paths, commands, and outputs are all sanitization hotspots.

## Scope compliance

This sprint adds research notes and sanitized fixtures only. It does not implement a Pi adapter, parser, Work Store, SQLite schema, semantic engine, OpenCode integration/handoff, model summarization, cloud service, sync, daemon, MCP, resume, agent execution, or UI.
