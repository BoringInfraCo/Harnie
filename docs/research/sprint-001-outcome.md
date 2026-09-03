# Sprint 001 outcome

Status: **Completed with an explicit local-evidence limitation**  
Decision: **CONDITIONAL GO**  
Evidence cutoff: 2026-08-28

## Sprint question

> What information does a real Pi coding session persist, and which parts can Harnie reliably observe and normalize?

Answer: current Pi CLI version-3 sessions persist source/session identity, startup workspace, append chronology, an entry tree, user/assistant/direct-shell messages, ordered assistant content, structured tool calls and results, and provider/model/usage data. Current source can also persist typed summary/extension records, although those types were not encountered in the committed fixtures. This is enough for conservative event normalization and provenance-backed semantic Work State derivation.

The important semantic concepts—goal, decisions, findings, relevance, unresolved work, and next steps—are not first-class Pi records. Harnie must derive them from structured source evidence and must retain the evidence/uncertainty boundary.

## Why the decision is conditional

The structured evidence is richer than a flat transcript and supports a credible Phase 0 path. Fixtures B and C demonstrate call/result correlation, tool calls conventionally shaped like file/command operations, investigation, decisions, changes, and verification pending at Fixture C's selected prefix boundary without replaying the source session.

The decision is not a full GO because:

1. this machine has no persisted local Pi sessions or installed Pi version;
2. committed fixtures derive from real maintainer-published public traces, not user-local traces;
3. the public upload/redaction pipeline may omit locally significant fields;
4. semantic Work State still requires derivation, with provenance and confidence;
5. upstream source contains an emerging version-4 session family that is not current CLI fixture evidence.

The condition to remove was concrete: validate the same source shapes and recoverability conclusions against at least two representative user-local coding sessions, including one stateful/unfinished session, using strictly read-only capture.

Sprint 002 closed that condition on 2026-09-01 with local traces E and F. See `docs/research/sprint-002-outcome.md`.

## Deliverables

| Deliverable | Location | Status |
|---|---|---|
| Representative sanitized fixtures | `tests/fixtures/pi/*.jsonl` | Complete: A, B, C, and genuine D model-transition fixture |
| Fixture provenance and transformations | `tests/fixtures/pi/manifest.json` | Complete |
| Fixture handling notes | `tests/fixtures/pi/README.md` | Complete |
| Session format research | `docs/research/pi-session-ground-truth.md` | Complete |
| Source-record inventory | `docs/research/pi-source-record-inventory.md` | Complete |
| Proposed normalization mapping | `docs/research/pi-normalization-and-recoverability.md` | Complete |
| Work State recoverability matrix | `docs/research/pi-normalization-and-recoverability.md` | Complete |
| Unknowns and risks | Ground-truth and mapping notes | Complete |
| Sprint decision and Sprint 002 recommendation | This document | Complete |

## Fixture classes

- **A — Minimal:** one user/assistant exchange with model, reasoning-level, usage, and timestamp evidence.
- **B — Coding:** calls named bash, read, and edit with built-in-shaped arguments, three correlated tool-reported results, and a final completion message.
- **C — Stateful:** an append-valid prefix containing a goal, parallel investigation calls, a source-backed finding, an implementation decision, two edit-named calls reporting success, and verification still outstanding at that selected prefix boundary. The original source session later continued.
- **D — Structural edge:** a real append-valid prefix with two model changes and an assistant response on the later model.

Fixture D was not manufactured: the two model transitions existed in the source trace. No claim is made that D covers branch, compaction, or extension records.

## Source records observed

Observed in committed fixtures:

- `session`
- `model_change`
- `thinking_level_change`
- `message` with `user`, `assistant`, and `toolResult` roles
- nested assistant `text`, `thinking`, and `toolCall` blocks

Observed in the wider real public inspection pool but not committed fixtures:

- `message` with `bashExecution` role
- `label`
- `session_info`
- a `write`-named tool call with built-in-shaped arguments

Known from current documentation/source but not encountered in inspected real traces:

- `compaction`
- `branch_summary`
- `custom`
- `custom_message`

Those four remain source-defined, fixture-unverified records. Unknown future records remain opaque/unmapped.

## Proposed normalization summary

Direct mappings:

- user/assistant content → `message`
- assistant tool-call block → `tool_call`
- tool-result message → `tool_result`
- direct `bashExecution` → `command`

Possible later, convention-based classifications for model-issued calls:

- call named `bash` → derived `operation.kind = command`
- call named `read` → derived `operation.kind = file_read`
- call named `write`/`edit` → derived `operation.kind = file_write`

These are not reliable from v3 name/arguments alone: Pi extensions may override built-in tool names, and v3 does not persist tool-definition provenance. Sprint 002 should normalize them generically as `tool_call` unless origin is independently verified.

All other source records remain in the raw-preserving stream as typed or unknown unmapped records. No source information is guessed into a Harnie event.

## Recoverability summary

Directly observed:

- workspace
- source session identity
- physical chronological activity
- messages
- tool activity

Derivable:

- Harnie Execution identity and Work grouping
- active branch chronology
- relevant files
- artifacts
- goal
- decisions
- findings
- unresolved work
- next steps

Not reliably available from a v3 session alone:

- exact emitter version
- repository/remote/branch/revision
- durable final filesystem state
- full environment/system-prompt/tool-definition snapshot
- native execution identity distinct from source session
- navigation-only final leaf state

## Security and sanitization review

The committed fixtures:

- use `/workspace/pi-project` instead of a personal path;
- contain no original private/local username;
- replace reasoning and provider signatures with explicit typed markers;
- rewrite conversation text, commands, file contents, and tool results;
- include no images, environment dumps, authentication data, cookies, or credentials;
- retain record IDs, parent links, line order, timestamps, message roles, tool names, usage shapes, and call/result correlations;
- record their public source revision and transformation policy;
- do not copy or modify any original Pi storage.

Validation performed:

- parsed every JSONL record successfully;
- confirmed each file begins with a session header;
- confirmed unique entry IDs and resolvable parent chains in all fixtures;
- confirmed every tool result links to a preceding tool call;
- confirmed outer timestamps are strings and nested message timestamps are numbers;
- confirmed all four manifest entries resolve to fixture files;
- scanned for common credential, token, private-key, personal-path, local-username, and unsanitized provider-signature patterns with no matches.

Structural check results:

| Fixture | Records | Entry IDs | Tool calls |
|---|---:|---:|---:|
| `minimal.jsonl` | 5 | 4 | 0 |
| `coding.jsonl` | 11 | 10 | 3 |
| `stateful-prefix.jsonl` | 14 | 13 | 6 |
| `model-transition.jsonl` | 6 | 5 | 0 |

## Definition of Done audit

| Criterion | Result |
|---|---|
| Current Pi persistence researched | Met through current docs plus v0.84.3 and main source |
| Local Pi session storage inspected read-only | Met; no populated/configured session store exists |
| Representative real sessions captured and sanitized | Met through maintainer-published real traces; limitation: not local |
| Encountered source types documented | Met |
| Identity/ordering/parent semantics understood | Met for v3; branch behavior source-backed but fixture-unverified |
| Candidate normalization mapping documented | Met |
| Unknown/unmapped records accounted for | Met |
| Recoverability matrix complete | Met |
| Security review | Met subject to recorded automated checks |
| GO/CONDITIONAL GO/NO-GO recorded | CONDITIONAL GO |
| Sprint 002 recommendation follows from evidence | Met below |

## Evidence-backed Sprint 002 recommendation

Do not begin broader V0 implementation. Sprint 002 should be narrowly scoped to a read-only, raw-preserving Pi session reader and conservative v3 normalizer against these fixtures, with explicit unsupported-version diagnostics.

Recommended entry criteria:

1. obtain user-supplied sanitized local sessions or an explicitly authorized read-only location containing at least one coding and one unfinished/stateful trace;
2. record the installed Pi version separately from session header version;
3. include one real branch or compaction fixture if local evidence provides it; do not synthesize it;
4. decide and document the raw-record retention policy before importing private sessions.

Recommended implementation constraints:

- generic read-only file I/O only; never Pi's mutating loader on originals;
- header-family sniffing for v3 versus emerging v4;
- line-numbered raw record preservation before validation;
- diagnostics for malformed JSON, duplicate/orphan IDs, unknown types, and broken call/result links;
- separate append chronology from active-path reconstruction;
- only the normalization rules approved in this sprint;
- no SQLite, semantic derivation, OpenCode handoff, or later-phase feature in that sprint unless its own scope explicitly authorizes it.

## Final north-star assessment

Pi's persisted reality is sufficiently structured to challenge and refine Harnie's abstraction rather than forcing Harnie to forward an undifferentiated transcript. The evidence supports continuing, but local compatibility has not yet been proven.
