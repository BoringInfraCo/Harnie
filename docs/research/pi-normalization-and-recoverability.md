# Pi normalization boundary and Work State recoverability

Evidence cutoff: 2026-08-28

## Proposed smallest boundary

The smallest evidence-backed boundary is not a direct cast from every Pi record to a Harnie event. It is a raw-preserving stream item with one of two outcomes:

```text
Pi source record/block
├── mapped event
│   ├── message
│   ├── tool_call
│   ├── tool_result
│   └── command (direct bashExecution only)
└── unmapped source record
```

Model-issued calls named `bash`, `read`, `write`, or `edit` remain `tool_call` events. A later layer may add a convention-based operation classification:

```text
tool_call.operation.kind = command | file_read | file_write
```

This avoids emitting two chronological events for one source call while retaining the generic tool boundary. [Pi extensions can override built-in tools under the same names](https://pi.dev/docs/latest/extensions#overriding-built-in-tools), and v3 sessions do not persist tool-definition provenance. Name and argument shape are therefore insufficient for a reliable normalization-time specialization. Any operation classification must be labeled derived and convention-based unless tool origin is independently verified.

Every stream item retains raw source JSON or an equivalent lossless source reference plus provenance. Unknown/unmapped records are data, not parser failures.

## Minimal provenance envelope

```text
harness                  "pi"
source_format            "coding-agent-session-v3"
source_session_id        session header id
source_entry_id?         non-header entry id
source_parent_id?        entry parentId
source_line              one-based physical JSONL line
source_block_index?      assistant content position
source_tool_call_id?     tool-call correlation id
source_timestamp?        outer ISO timestamp
observed_or_derived      observed | convention_based_derivation
raw_record               lossless source payload or content-addressed reference
```

The emitting Pi package version is not available from a normal v3 header and must remain unknown unless collected separately.

## Mapping table

| Pi source | Proposed normalized representation | Status | Evidence and guardrails |
|---|---|---|---|
| Header `session` | Source-session and workspace metadata, not an event | Directly observed | Header ID/cwd/timestamp are persisted in Fixtures A–D. `cwd` is context, not Work identity. |
| User `message` | `message` with role `user`, ordered content, source timestamps | Directly observed | Fixtures A–D. Preserve images/unknown blocks even if no higher projection exists. |
| Assistant `message` text/thinking | `message` with role `assistant` and ordered non-tool blocks | Directly observed | Fixtures A–D. Keep provider/model/usage/stop metadata on source envelope. |
| Assistant `toolCall` block | `tool_call` | Directly observed | Fixtures B/C. Event provenance requires entry ID and content-block index as well as call ID. |
| Tool result `message` | `tool_result` | Directly observed | Fixtures B/C. Correlate via `toolCallId`; retain unmatched results rather than dropping them. |
| Direct `bashExecution` message | `command` | Directly observed in public inspection pool | Distinct from model-issued bash. Retain `excludeFromContext`, truncation, exit/cancellation, and overflow-reference fields. |
| Call named `bash` | `tool_call`; optional derived `operation.kind = command` | Convention-based derivation | Extensions can override the name. Validate arguments and verify tool provenance before treating the classification as reliable. Never infer file effects from shell syntax here. |
| Call named `read` | `tool_call`; optional derived `operation.kind = file_read` | Convention-based derivation | Fixture B/C shapes match the built-in convention, but v3 does not prove the invoked definition was built-in. |
| Call named `write` | `tool_call`; optional derived `operation.kind = file_write` | Convention-based derivation | Current built-in source contract; no committed fixture and no v3 origin field. |
| Call named `edit` | `tool_call`; optional derived `operation.kind = file_write` | Convention-based derivation | Fixture B/C shapes match the built-in convention; edit argument shapes also vary by version. |
| `model_change` | Unmapped typed source-state record | Directly observed | Fixtures A–D. Needed for execution metadata reconstruction, but not one of the minimal chronological event kinds. |
| `thinking_level_change` | Unmapped typed source-state record | Directly observed | Fixtures A–D. Preserve; do not force into `message`. |
| `session_info` | Unmapped source metadata | Directly observed in inspection pool | May support derived Work title, never goal by itself. |
| `label` | Unmapped source metadata | Directly observed in inspection pool | Preserve entry identity and separate `targetId` relationship. |
| `compaction` | Unmapped source checkpoint/context record | Source/documentation only | Preserve summary and linkage. Summary is model-derived source content, not direct truth. |
| `branch_summary` | Unmapped source branch/context record | Source/documentation only | Preserve `parentId` and `fromId` as different relations. |
| `custom` | Unmapped opaque source record | Source/documentation only | Extension state is excluded from model context; interpretation requires an explicit extension contract. |
| `custom_message` | Unmapped opaque source message | Source/documentation only | Participates in Pi context, but extension-specific semantics remain unknown. |
| Unknown well-formed record/block | Unmapped source record/block | Unknown by definition | Preserve discriminator, raw payload, position, graph fields, and diagnostics. |
| Malformed JSON line | Parse diagnostic plus raw bytes/reference | Invalid source line, not “unknown type” | Pi's own permissive skip behavior should not be copied silently. |

## Why file and command specializations are deferred

Fixtures B and C show that a `read` or `edit` operation is physically one nested tool-call block followed by a result message. Emitting both a generic `tool_call` event and a second `file_read`/`file_write` event would duplicate the source action in chronology.

When independently justified, a derived facet keeps:

- one event per source call;
- generic tool fidelity;
- convention-based operational search with explicit provenance;
- a clear distinction between observed call data and semantic Work derivation.

Direct `bashExecution` is the exception because its source is already a standalone command message rather than a tool call.

## Work State recoverability matrix

The classification uses the sprint's required values. Notes identify important mixed cases.

| Work State element | Classification | Evidence and limitations |
|---|---|---|
| Workspace | **directly observed** | Header `cwd` appears in every fixture. It is startup context, may be stale after `cd`, and must be privacy-normalized for export. Repository/branch/revision are not header fields. |
| Execution identity | **derivable** | Header session ID directly identifies the source session, not the separate Harnie `Execution.id` defined by the architecture. Harnie Execution identity/work grouping must be generated, and no distinct native Pi run identity is persisted. |
| Chronological activity | **directly observed** | Physical append order is direct. Active logical branch order is derivable from `parentId`; navigation-only leaf changes may be unavailable. |
| Messages | **directly observed** | User/assistant/tool-result/direct-shell messages are persisted with content and timestamps, subject to sanitization and compaction-context interpretation. |
| Tool activity | **directly observed** | Calls, arguments, ordered blocks, results, correlation IDs, errors, and tool names are structured in Fixtures B/C. Arbitrary side effects are not directly known. |
| Relevant files | **derivable** | Path arguments are directly observed in calls whose names/shapes resemble built-ins. Actual access/edit and “relevance” are derived because v3 does not prove tool implementation. Shell activity and summaries can mention files without structured proof. |
| Artifacts | **derivable** | Tool calls/results can support a claim that a file was written/edited. Current durable artifact content/revision is not guaranteed by the session. |
| Goal | **derivable** | Usually inferable from user messages or a compaction summary. No stable goal field exists. A session can contain multiple or changing goals. |
| Decisions | **derivable** | Assistant/user language can contain decisions and rationale, as Fixture C does. They are not typed records and may be tentative or contradicted later. |
| Findings | **derivable** | Tool output and messages provide evidence, but deciding what constitutes a meaningful finding is semantic. Tool output can be stale, truncated, or erroneous. |
| Unresolved work | **derivable** | At Fixture C's selected prefix boundary, two edit-named calls have tool-reported success and verification has not yet occurred. The original longer session did continue; the fixture does not prove an unfinished end-of-session state. In general, absence of completion is weak evidence. |
| Next steps | **derivable** | Explicit language can be extracted; otherwise suggested next actions require semantic interpretation. No structured next-step record exists. |

## Important unavailable state outside the required matrix

The following are **not reliably available** from a normal version-3 session alone:

- exact Pi package version;
- Git repository identity, remote, branch, or revision at each event;
- durable post-tool filesystem state;
- environment snapshot and sensitive-variable policy;
- system prompt and all loaded context files as a versioned bundle;
- active tool definitions/versions;
- execution/run identity distinct from the session;
- the final viewed leaf after navigation with no append;
- native resume state across arbitrary harnesses.

## Provenance for derived Work State

A derived claim must point to the smallest useful evidence set:

```text
Finding: "The gate is centralized in models.ts"
evidence:
  - source session: ba67782f-...
  - source entry: e34f930a
  - source line: 7
  - source entry: 31cac896
  - source line: 9
derivation: semantic
confidence: bounded by sanitized fixture evidence
```

Any derived operation classification should identify its exact call block and the rule's limitation:

```text
operation: file_read
evidence:
  source entry: 8aec3e68
  source block index: 1
  source tool call id: toolu_01QXe...
derivation: convention "tool named read + valid path"
confidence: unverified tool origin in v3
```

## Phase 0 parser implications for Sprint 002

This section is a recommendation only; Sprint 002 is not implemented here.

1. Read source files with ordinary read-only I/O, never Pi's mutating loader.
2. Sniff v3 `type: session` versus emerging v4 `kind: header` before parsing.
3. Preserve raw well-formed records and line numbers before validation/projection.
4. Validate header, IDs, graph edges, timestamps, roles, content blocks, and tool correlation with diagnostics.
5. Keep physical chronology separate from active-path reconstruction.
6. Normalize only the direct mappings above; keep tool-operation specialization out unless tool provenance can be verified.
7. Keep semantic derivation out of the adapter.
8. Require additional real local fixtures before claiming local Pi compatibility.
