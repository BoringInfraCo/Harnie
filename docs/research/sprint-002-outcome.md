# Sprint 002 Outcome - Pi Evidence Reader + Conservative Normalizer

Status: Conditional GO

## Baseline

- Branch: `main`, tracking `origin/main`.
- Repository baseline before implementation contained docs and Sprint 001 public-derived fixtures.
- Sprint 001 artifacts were preserved.
- No local Pi CLI installation was found.
- `~/.pi/agent` existed but contained only `skills/`; `~/.pi/agent/sessions` was absent.
- No local Pi sessions were available for Sprint 002 validation.

## Implementation

Sprint 002 implemented the smallest production foundation for:

- raw-preserving `SourceRecord`;
- Pi source-family detection from JSONL header evidence;
- generic read-only JSONL file/text reader;
- parent graph diagnostics;
- tool-call/result correlation by `toolCallId`;
- conservative `NormalizedEvent` projection;
- exact event provenance;
- automated tests.

No SQLite Work Store, Work reconstruction, OpenCode handoff, semantic derivation, resume, daemon, sync, UI, cloud storage, or agent execution was implemented.

## SourceRecord Shape

`SourceRecord` preserves:

- Pi harness identity separately from source-format family;
- source family: `pi-session-v3`, `pi-session-v4`, or `unknown`;
- optional session id and source path;
- physical JSONL line number;
- exact raw JSONL line text;
- parsed raw JSON object;
- source type/kind;
- entry id, parent id, and timestamp when present;
- record-local diagnostics.

Malformed or non-object JSONL lines are represented separately as malformed source lines so valid surrounding records remain readable.

## Detection Behavior

Detection is based only on header evidence:

- `{ "type": "session", "version": 3 }` -> `pi-session-v3`;
- `{ "kind": "header", "version": 4 }` -> `pi-session-v4`;
- anything else -> `unknown` with `unsupported_source_family`.

The implementation does not infer source format from installed Pi versions, file paths, or package metadata.

## Reader Behavior

The reader uses ordinary filesystem reads and `JSON.parse`. It does not call Pi loaders and does not repair or rewrite source files.

It preserves physical chronology through line numbers and record order. Parent graph validation is separate from physical order.

## Diagnostics

Implemented diagnostics include:

- `empty_line`;
- `malformed_jsonl`;
- `non_object_jsonl`;
- `empty_session`;
- `unsupported_source_family`;
- `missing_entry_id`;
- `missing_parent_id`;
- `malformed_parent_id`;
- `malformed_timestamp`;
- `duplicate_entry_id`;
- `orphan_parent`;
- `self_parent`;
- `parent_cycle`;
- `duplicate_tool_call_id`;
- `missing_tool_result`;
- `orphan_tool_result`;
- `duplicate_tool_result`;
- `ambiguous_tool_result`;
- `unknown_message_role`;
- `unknown_record_type`.

## NormalizedEvent Kinds

Implemented normalized event kinds:

- `message` for user and assistant message content;
- `tool_call` for nested assistant `toolCall` content blocks;
- `tool_result` for `toolResult` messages;
- `command` only for direct `bashExecution` messages;
- `unknown` for valid records not conservatively normalized.

Generic Pi tool names such as `bash`, `read`, `write`, and `edit` remain `tool_call` events. The normalizer does not claim file or command semantics from extension-overridable names.

Assistant thinking blocks remain preserved inside assistant message content and are not treated as user-visible assistant text.

## Tool Correlation

Tool calls are discovered only from assistant content blocks with `type: "toolCall"` and a string `id`.

Tool results are discovered only from `message.role === "toolResult"` records with a string `toolCallId`.

Correlation is by `toolCallId`. The implementation reports missing results, orphan results, duplicate call ids, duplicate result ids, and ambiguous result matches.

## Provenance Guarantees

Every normalized event retains:

- harness;
- source family;
- session id when observed;
- source path when known;
- physical line number;
- entry id and parent id when present;
- source record type;
- nested content index for tool-call blocks;
- toolCallId for tool-call/tool-result events;
- the full originating `SourceRecord`, including exact raw JSONL text.

## Local Evidence

Required local coding trace: not available.

Required local unfinished/stateful trace: not available.

Read-only inspection found no local Pi session storage. Sprint 002 therefore cannot claim validation against private/local Pi sessions.

The safest compliant route for later completion is to generate traces in a disposable synthetic workspace with a temporary Pi agent directory, or to provide raw sessions at an explicitly authorized read-only location. Raw private sessions must not be committed.

## Public Fixture Comparison

The Sprint 001 public-derived fixtures validated:

- version-3 session header detection;
- physical JSONL chronology;
- parent-id chain checks;
- nested assistant tool-call extraction;
- tool-result correlation;
- preservation of model/thinking-change records as `unknown`;
- provenance down to nested content block index.

The model-transition fixture contains two `model_change` records separated by a `thinking_level_change` record, not two consecutive model-change records.

## Security and Privacy

No raw local Pi sessions were read or copied because none were present.

No secrets, credentials, or private local paths were introduced. Fixtures remain the sanitized Sprint 001 public-derived fixtures.

## Checks

- `npm run build`: pass.
- `npm test`: pass, 12 tests.
- `npm run check`: pass.

Vet was attempted twice before staging and crashed while diffing untracked files. Vet was then attempted with `--staged`; that reached tokenizer loading but failed under sandboxed network restrictions. An escalated rerun was rejected because it could disclose the staged diff and exported Codex session to an external service.

## Decision

Conditional GO.

The implementation satisfies the code foundation against public-derived fixtures and synthetic malformed cases. The remaining condition is local Pi evidence: Sprint 002's two required real local traces were unavailable in this environment.

## Sprint 003 Recommendation

Do not begin Sprint 003 until local evidence is captured or explicitly deferred.

Recommended next step:

- capture two sanitized real Pi traces from an isolated disposable workspace;
- add them to `tests/fixtures/pi/` with manifest provenance;
- rerun the same reader, graph, correlation, and normalization tests against those fixtures;
- only then decide whether to proceed from conservative normalized events into Work State reconstruction.
