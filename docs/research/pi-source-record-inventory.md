# Pi source-record inventory

Evidence cutoff: 2026-09-01  
Target format: current Pi CLI version-3 JSONL

This inventory separates persisted source records from nested message/content types. “Encountered” means observed in a real public trace during this sprint; it does not mean the record appears in every committed fixture.

## Top-level records encountered

| Source type | Meaningful fields | Identity and relationships | Ordering semantics | Phase 0 treatment | Observation status |
|---|---|---|---|---|---|
| `session` | `version`, `id`, ISO `timestamp`, `cwd`, optional `parentSession` | Header ID is source-session identity. It has no entry `parentId`. `parentSession` is a local path, not a stable ID. | Must be the header/metadata line; not part of the entry graph. | Required source-session/workspace metadata; never a chronological activity event. | Fixtures A–D; documentation; released source |
| `model_change` | `provider`, `modelId` plus entry base | Entry identity is `(session id, entry id)`. Parent joins it to the session tree. | Append chronology plus active parent path. Later active-path evidence wins. | Preserve as source state change. Do not force into `message` or tool categories. | Fixtures A–D; D has two transitions; documentation; released source |
| `thinking_level_change` | `thinkingLevel` plus entry base | Normal tree entry. | Append chronology plus active parent path. | Preserve as source state change; no candidate event mapping. | Fixtures A–D; documentation; released source |
| `message` / user | Nested `role`, string or text/image `content`, numeric timestamp | Entry has source ID/parent. Content blocks have position but usually no ID. | Entry append order and content-block order are both meaningful. | Map to normalized `message`; retain raw envelope. | Fixtures A–D; documentation; released source |
| `message` / assistant | Ordered content blocks; `api`, `provider`, `model`; usage/cost; stop/error fields; numeric timestamp; optional provider metadata | Entry ID identifies envelope. Tool-call block IDs identify calls within it. | Content block order must be preserved. One message can emit multiple tool calls. | Map textual/thinking assistant activity to `message`; extract tool-call blocks separately without losing the envelope. | Fixtures A–D; documentation; released source |
| `message` / toolResult | `toolCallId`, `toolName`, content, optional opaque `details`/usage/added tool names, `isError`, numeric timestamp | `toolCallId` joins to a nested assistant block. It is unrelated to tree `parentId`. | Result entries follow the assistant call in observed traces, but correlation must use ID. | Map to `tool_result`; preserve unmatched results and opaque details. | Fixtures B/C; documentation; released source |
| `message` / bashExecution | `command`, `output`, `exitCode`, `cancelled`, `truncated`, optional `fullOutputPath`, optional `excludeFromContext`, numeric timestamp | Normal message entry, but no assistant tool-call ID. | Normal entry chronology. | Map directly to `command`; retain exclusion/truncation semantics. | Encountered in public inspection pool; released source |
| `label` | `targetId`, optional `label` plus entry base | Entry itself is a tree node; `targetId` is a separate cross-reference. Repeated records mutate the effective label. | Effective labels accumulate session-globally in physical append order, not only on the active branch. | Preserve as unmapped source metadata for Phase 0. | Encountered in public inspection pool; documentation; released source |
| `session_info` | optional `name` plus entry base | Normal tree entry; successive entries update display metadata. | The latest physically appended session-info mutation is effective session-globally, including an explicit clear; it is not active-path-scoped. | Preserve as source metadata; a name may help derive a title but is not the Work goal. | Encountered in public inspection pool; documentation; released source |

Public inspection pool evidence not promoted to a fixture includes:

- `bashExecution`: `2026-01-18T11-13-14-021Z_472cf2fa-ab5b-49be-9c1a-42c0c5978980.jsonl`
- `label`: `2026-01-26T10-39-21-246Z_304b1dd3-57f1-4b5d-9d99-59fc411c6e2a.jsonl`
- `session_info`: multiple inspected traces, including `2026-01-16T23-40-31-481Z_8ff6046f-bf83-40e0-ada5-53bcf3c526ab.jsonl`

All are from dataset revision `dac2a1d3ba12dda597b973a791a77618ccb5f413`.

## Current source types not encountered in real trace inspection

| Source type | Meaningful fields | Identity and relationships | Phase 0 treatment | Evidence basis |
|---|---|---|---|---|
| `compaction` | `summary`, `firstKeptEntryId`, `tokensBefore`, optional `details`, `usage`, `fromHook` | Normal entry. `firstKeptEntryId` points into the active path and is not a parent edge. | Preserve losslessly as source checkpoint/context metadata. Do not map the model-generated summary to an observed message claim. | Documentation and released source only |
| `branch_summary` | `fromId`, `summary`, optional `details`, `usage`, `fromHook` | `parentId` is the new attachment point; `fromId` is the abandoned leaf. | Preserve losslessly as branch/context metadata. | Documentation and released source only |
| `custom` | `customType`, optional arbitrary `data` | Normal entry; payload is extension-owned and excluded from model context. | Opaque/unmapped by default. Never guess semantics from `customType` alone. | Documentation and released source only |
| `custom_message` | `customType`, content, `display`, optional arbitrary `details` | Normal entry; participates in model context. | Preserve as an unmapped source message until an explicit extension contract supports interpretation. | Documentation and released source only |

These types are part of the known current source union, but the sprint has no fixture basis for field variants or extension-specific payloads.

## Nested assistant content encountered

| Block type | Meaningful fields | Identity | Phase 0 treatment | Evidence |
|---|---|---|---|---|
| `text` | `text`, optional provider signature fields in current types | No guaranteed block ID; use source entry ID plus block index. | Part of normalized assistant `message`. | Fixtures A–D; source |
| `thinking` | reasoning text plus optional signature/provider metadata | No guaranteed block ID; use source entry ID plus block index. | Preserve with visibility/type metadata. Whether to expose thinking downstream is a later policy decision. | Fixtures A–C; source |
| `toolCall` | `id`, `name`, `arguments`, optional signature/namespace/provider fields | Durable source identity is session + assistant entry ID + block index. Provider ID is a correlation key whose uniqueness is not validated. | Normalize to `tool_call`. Defer operation specialization because extensions may override built-in names and v3 omits tool origin. | Fixtures B/C; source |

Image content is documented and source-defined but was deliberately not copied into fixtures.

## Tool shapes encountered

| Tool name | Observed call shape | Evidence-safe interpretation | Result limitations |
|---|---|---|---|
| `bash` | `arguments.command`; current built-in source may allow timeout | A call with this name and command is directly observed. Classifying it as the built-in command operation is convention-based unless origin is verified. File effects are not known. | Text/output may be truncated; optional overflow paths are transient; exit status may be in details or message error state depending on tool/version. |
| `read` | `arguments.path`; optional offset/limit in current built-in source | A call with this name/path is directly observed. File-read classification is convention-based because an extension can override the name. | Result content is a captured result, not proof of current file contents. |
| `edit` | Fixture shape uses `path`, `oldText`, `newText`; built-in source supports evolving/legacy shapes | A call with this name/arguments is directly observed. File-write classification is convention-based unless origin is verified. | Success text/details can confirm tool-reported completion, but not repository revision or durable artifact state. |
| `write` | Local fixture E uses `arguments.path` and `arguments.content` | A call with this name/path/content is directly observed. File-write classification remains convention-based; v3 has no tool-origin field. | Fixture E includes both tool-reported success and `isError: true` for a denied `.env` path. Denied writes are not artifacts. |

`write` is defined as a built-in in current source and is now present in local fixture E (`trace-a-coding.jsonl`), including a successful write and a denied `.env` write with `isError: true`. Name-based file-write classification remains convention-based. Custom tool names and all result `details` remain opaque unless a versioned contract is known.

## Identity rules

Use these source identities in future parser fixtures:

```text
source session  = (harness = "pi", session header id)
source entry    = (source session, entry id)
content block   = (source entry, zero-based content index)
tool call       = (source session, assistant entry id, content block index)
physical record = (source file fingerprint, one-based line number)
```

Do not use:

- entry ID alone across sessions;
- encoded CWD directory as workspace identity;
- `parentSession` path as a cross-machine session ID;
- timestamp as unique identity;
- provider `toolCall.id` as guaranteed unique durable identity; retain it as a correlation key and diagnose zero or multiple candidate calls;
- tool-result entry `parentId` as call/result correlation.

Basis: documentation, released source, and Fixtures B/C.

## Ordering rules

1. Preserve physical line number as append chronology.
2. Validate that every non-null `parentId` resolves within the same session, but retain orphaned records with diagnostics.
3. Build logical paths by walking parent IDs from a selected leaf.
4. Preserve block order within assistant content.
5. Correlate tool results by `toolCallId`, allowing multiple calls per assistant entry.
6. Treat outer ISO time and inner numeric time as observed fields, not as identity or a replacement for source order.

## Unknown records

Future or extension records must remain representable as raw, well-formed JSON with:

```text
source session identity
source file fingerprint/location policy
physical line number
raw type/kind discriminator
raw payload
parse diagnostics
parent ID when present
```

Unknown does not mean invalid. Malformed JSON, duplicate IDs, orphan parents, unsupported versions, and structurally unknown records are separate diagnostic classes and must not be silently collapsed.
