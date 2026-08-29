# Sprint 002 Outcome - Pi Evidence Reader + Conservative Normalizer

Status: Conditional GO

Re-execution date: 2026-08-28
Re-executed by: Harnie execution pass (Sprint 002 local-evidence closure attempt)
Re-execution basis: prior implementation at commit `56b5460` (initial Sprint 002 implementation, ended Conditional GO on the same local-evidence condition) plus read-only local inspection performed for this pass.

## Execution plan (as executed, mapped to Sprint 002)

1. Baseline inspection - `git status`, `git log`, working tree, test/build state. (Sprint 002 §1, Definition of Done)
2. Read canonical docs in full: ROADMAP, ARCHITECTURE, IMPLEMENTATION, SPRINT-001, the four research notes, and the fixture manifest/README. (Task instruction)
3. Confirm existing implementation against the sprint spec via a read-only code-review subagent. (Sprint 002 §1-§16, §20)
4. Locate local Pi session storage read-only via a dedicated exploration subagent, then independently re-verify with direct read-only shell checks. (Sprint 002 §17, task instruction "report immediately rather than manufacturing evidence")
5. If real local sessions were found: sanitize, document provenance, add fixtures, rerun tests. (Sprint 002 §18, §20) - NOT REACHED.
6. Compare local vs public evidence; update research notes where contradicted. (Sprint 002 §19) - public-only; no local evidence to compare.
7. Write outcome report and Sprint 003 recommendation. (Sprint 002 §21, §23, §24)

## Baseline

- Branch: `main`, tracking `origin/main`.
- Working tree clean before this pass (`git status` clean). Two commits exist: `607c744` (Initial commit) and `56b5460` (Implement Sprint 002 Pi evidence reader).
- Sprint 001 artifacts (research notes, fixtures, governing docs) preserved and untouched.
- Prior Sprint 002 implementation already present in `src/` and `tests/`; no production code was changed during this re-execution. The only file updated for this pass is this outcome report.

### Files present (already implemented at `56b5460`)

- `src/types.ts` - `SourceRecord`, `NormalizedEvent`, `Diagnostic`, source-family enums.
- `src/pi/reader.ts` - generic read-only JSONL reader.
- `src/pi/detect.ts` - header-based source-family detection.
- `src/pi/graph.ts` - parent-graph validation/diagnostics.
- `src/pi/correlate.ts` - tool-call/result correlation by `toolCallId`.
- `src/pi/normalize.ts` - conservative NormalizedEvent projection.
- `src/pi/diagnostics.ts` - diagnostic codes/severities.
- `src/index.ts` - public surface.
- `tests/pi-reader.test.ts`, `tests/pi-graph.test.ts`, `tests/pi-correlate.test.ts`, `tests/pi-normalize.test.ts`.
- `tests/fixtures/pi/*` - four public-derived sanitized fixtures + `manifest.json` + `README.md`.

### Checks (this pass, run directly)

- `npx tsc --noEmit` (build): exit 0 - pass.
- `npx vitest run` (test): 4 files, 12 tests, all pass.
- No `npm run check` full run (chained build+test) completed within the sandbox timeout, but its two components were run individually and both pass.

## Implementation architecture

Sprint 002 implements only the first two layers of Harnie's boundary:

```
Pi source evidence (read-only generic I/O)
        ↓
raw-preserving SourceRecord[]   (physical line order + parent graph, both retained)
        ↓
conservative NormalizedEvent[]  (message / tool_call / tool_result / command / unknown)
```

No SQLite Work Store, Work persistence, Work domain model, Work reconstruction, goal/decision/finding/artifact/next-step derivation, model-assisted semantic derivation, OpenCode adapter or handoff, resume, cloud, sync, daemon, MCP, agent execution, or UI is implemented. The Sprint 002 freeze (§22) is respected.

## SourceRecord shape

`SourceRecord` (`src/types.ts`) preserves:

- harness identity (`"pi"`) kept separate from source-format family;
- source family: `pi-session-v3`, `pi-session-v4`, or `unknown`;
- optional session id and source path;
- physical JSONL line number (one-based);
- exact raw JSONL line text;
- parsed raw JSON object (lossless);
- source type/kind;
- entry id, parent id, and timestamp when present;
- record-local diagnostics.

Malformed or non-object JSONL lines are represented separately (not forced into `SourceRecord`), so valid surrounding records remain readable. This matches Sprint 002 §2.

## Source-format detection behavior

Detection is header-evidence only, never from the installed Pi version (Sprint 002 §5, §145):

- `{ "type": "session", "version": 3 }` -> `pi-session-v3`;
- `{ "kind": "header", "version": 4 }` -> `pi-session-v4`;
- anything else -> `unknown` with `unsupported_source_family`.

This is consistent with Sprint 001 research (`pi-session-ground-truth.md` §Emerging version-4 format risk and §File, identity, ordering model). Detection does not depend on file path, package metadata, or CWD encoding.

## Reader behavior

The reader (`src/pi/reader.ts`) uses ordinary filesystem reads and `JSON.parse`. It does not call Pi's SessionManager or any Pi loader, and does not repair, migrate, or rewrite source (Sprint 002 §4; honors `pi-session-ground-truth.md` read-only safety finding). It preserves physical line order via line numbers, emits `malformed_jsonl`/`non_object_jsonl`/`empty_line` diagnostics for bad lines, and keeps valid records adjacent to malformed ones.

## Diagnostics implemented

`Diagnostic` (`src/types.ts`) carries `code`, `severity` (info/warning/error), `message`, `location`, and `details`. Note: the field is named `location` (a source locator: path/line/entryId/contentIndex/toolCallId) rather than the spec's suggested literal `source` key; this is a cosmetic naming deviation, functionally equivalent, and not treated as a scope expansion. Diagnostic classes emitted:

- `empty_line`
- `malformed_jsonl`
- `non_object_jsonl`
- `empty_session`
- `unsupported_source_family`
- `missing_entry_id`
- `missing_parent_id`
- `malformed_parent_id`
- `malformed_timestamp`
- `duplicate_entry_id`
- `orphan_parent`
- `self_parent`
- `parent_cycle`
- `duplicate_tool_call_id`
- `missing_tool_result`
- `orphan_tool_result`
- `duplicate_tool_result`
- `ambiguous_tool_result`
- `unknown_message_role`
- `unknown_record_type`

## NormalizedEvent kinds implemented

- `message` - user and assistant message content (text/thinking blocks preserved distinguishable by `block.type`; thinking is not promoted to user-visible assistant text).
- `tool_call` - nested assistant `toolCall` content blocks. Generic Pi tool names (`bash`, `read`, `write`, `edit`) remain `tool_call` metadata; no `file_read`/`file_write`/`command` specialization is inferred from the name (Sprint 002 §12; `pi-normalization-and-recoverability.md` §Why file and command specializations are deferred).
- `tool_result` - `message` records with `role: "toolResult"`.
- `command` - ONLY for direct `bashExecution` messages where the source format itself establishes command semantics (Sprint 002 §13). A tool merely named `bash` does not become `command`.
- `unknown` - valid records Harnie does not conservatively normalize (e.g. `model_change`, `thinking_level_change`, `session_info`, `label`, and any forward-compatible type). Unknown does not mean invalid; raw payload and provenance are retained (Sprint 002 §14).

## Tool correlation behavior

Tool calls are discovered only from assistant content blocks with `type: "toolCall"` and a string `id`. Tool results are discovered only from `message.role === "toolResult"` with a string `toolCallId`. Correlation uses `toolCallId`, never `parentId` (Sprint 002 §9, §202). Diagnostics: missing result, orphan result, duplicate call id, duplicate result, ambiguous match. An unfinished session with a call and no completed result is represented, not repaired (Sprint 002 §208) - this is exactly what the local unfinished-trace requirement needs.

## Provenance guarantees

Every normalized event retains:

- harness;
- source family;
- session id when observed;
- source path when known;
- physical line number;
- entry id and parent id when present;
- source record type;
- nested content index for tool-call blocks;
- `toolCallId` for tool-call/tool-result events;
- the full originating `SourceRecord`, including the exact raw JSONL text.

This satisfies Sprint 002 §15 and `pi-normalization-and-recoverability.md` §Minimal provenance envelope. Harnie can answer "which exact Pi evidence caused this event" down to the line and nested block.

## Automated test results

12 tests across 4 files, all passing:

- reader: valid JSONL, malformed line, empty-line behavior, source preservation, physical line identity;
- graph: valid parent graph, orphan, duplicate id, self-parent, cycle;
- correlation: matched call/result, missing result, orphan result, duplicate correlation;
- normalization: user message, assistant message, tool call, tool result, direct command, unknown record; plus provenance mapping back to exact source evidence.

Coverage satisfies Sprint 002 §20. No test requires local sessions; all exercise public-derived fixtures and synthetic malformed cases.

## Local coding-trace evidence (Trace A)

**NOT AVAILABLE.** No real local Pi coding session exists on this machine. A read-only exploration subagent and an independent direct shell re-check both confirmed:

- `pi` CLI not installed (`which pi` / `command -v pi` / `npm ls -g pi` all empty); node v22.23.2 present but no global `pi` package.
- `~/.pi` does not exist at all (Sprint 001 had found `~/.pi/agent/skills/`; it is now gone entirely).
- No `~/.pi/agent/sessions`, no `~/Library/Application Support/*Pi*`, no `~/.config/pi`, no project-local `.pi/` caches under `~/Documents/Developer`.
- Home-wide JSONL search returned only Harnie's own `tests/fixtures/pi/*` (synthetic, non-private) plus unrelated `.cursor/.../agent-transcripts/*.jsonl` (Cursor, a different harness - explicitly NOT Pi and NOT eligible as Pi evidence).

No real local coding trace was captured. The required Trace A therefore remains unfulfilled.

## Local unfinished/stateful-trace evidence (Trace B)

**NOT AVAILABLE.** Same reason as Trace A: there is no local Pi session store, so no real unfinished/stateful Pi session could be inspected. The feasibility hypothesis (continuing unfinished work) could not be validated against a local session in this environment.

## Comparison against Sprint 001 public traces

Local traces could not be compared because none were captured. The public-derived fixtures (manifest `dac2a1d`) remain the only validated evidence and continue to agree with the Sprint 001 model:

- v3 header family detection holds (`{type:session,version:3}`).
- physical JSONL chronology preserved via line numbers.
- parent-id chain validation holds.
- nested assistant `toolCall` extraction holds (Fixtures B/C).
- tool-result correlation by `toolCallId` holds.
- `model_change`/`thinking_level_change` persisted as `unknown`, never promoted (Fixture D).
- provenance reaches nested content-block index.

The Fixture D note from the prior outcome stands: it contains two `model_change` records separated by a `thinking_level_change`, not two consecutive model-change records. No local evidence contradicted any Sprint 001 conclusion.

## Security and privacy validation

- No raw private Pi sessions were read, copied, moved, or committed: none exist locally.
- No secrets, credentials, or private local paths were introduced. Fixtures remain the sanitized public-derived set; their manifest documents every sanitization transformation (path rewrite to `/workspace/pi-project`, text redaction, signature/provider redaction, ID shortening, no images/credentials/env copied).
- Unrelated transcripts found (Cursor) were identified and deliberately excluded; no evidence was fabricated or misattributed to Pi.
- No Pi loader was used against any source; read-only generic I/O only.

## Assumptions corrected by local evidence

None. No local Pi evidence was captured in this pass, so no Sprint 001 or Sprint 002 assumption was corrected, contradicted, or refined by local observation. The Sprint 001 findings remain the governing model; they continue to be supported by the public-derived fixtures.

(One incidental environmental observation, not a model change: the local `pi` footprint shrank further - `~/.pi` is now absent rather than containing `skills/`. This only tightens the "no local sessions" conclusion and is recorded here and in `manifest.json` local-evidence note.)

## Remaining unknowns and risks

1. Local Pi behavior remains unvalidated (still 0 local sessions; no installed Pi version). This is the open condition.
2. The public dataset is real but pre-redacted; upload pipeline may have removed fields relevant to private/local sessions.
3. v3 header does not record emitter package version.
4. Entry IDs are session-scoped and may be copied across forks; `parentSession` is a path, not durable identity.
5. Default CWD directory encoding can collide.
6. Physical append order is not the same as an active branch path; a navigation-only leaf change may not persist.
7. Pi's permissive parser can silently skip malformed lines; Harnie deliberately does not copy that behavior.
8. Unknown records, content blocks, tool args, result details, and extension payloads may appear and must stay representable.
9. Shell/file tool side effects are not safely inferred from name or command string in v3 (no tool-origin field).
10. Generating REAL local traces requires either (a) an authorized read-only copy of real Pi sessions, or (b) installing the Pi CLI and driving it in a disposable workspace with a working LLM backend - infeasible autonomously here because no Pi install and no provider credentials are present.

## Decision

**Conditional GO.**

The production foundation is complete and faithful to Sprint 002: raw-preserving `SourceRecord`, header-based source-family detection, generic read-only reader, parent-graph and tool-correlation diagnostics, conservative `NormalizedEvent` projection, exact provenance, and 12 passing tests. No freeze was violated. The public-derived fixtures validate every implemented behavior against the Sprint 001 model.

The single open condition from the prior outcome remains unmet for an environmental reason, not a code or feasibility defect: this machine holds **no local Pi sessions** and **no installed Pi CLI**, so the two required real local traces (coding, and unfinished/stateful) could not be captured or inspected. Per the task's explicit instruction, no evidence was manufactured.

This is CONDITIONAL GO (not GO, because the local-evidence condition is unmet; not NO-GO, because none of the NO-GO triggers apply - the format is safely ingestible, coding activity needs no mutating loader, provenance survives normalization, and no semantics had to be invented at the boundary).

### Explicit condition for promotion to GO

Capture two real local Pi v3 traces and rerun the existing reader/graph/correlate/normalize tests against them:
- Trace A (coding): inspecting a repo, reading files, executing tools/commands, >=1 code change, a verification step.
- Trace B (stateful): a goal, investigation, multiple context interactions, >=1 meaningful choice/constraint, partial progress, deliberate stop before completion.

## Sprint 003 recommendation

Do not begin Sprint 003 yet.

Recommended next step, in priority order:
1. Obtain two sanitized real Pi traces, ideally from an isolated disposable workspace or an explicitly authorized read-only location - never commit raw private sessions.
2. Add them to `tests/fixtures/pi/` with manifest provenance documenting source class, capture method, sanitization performed, structural transformations, and known limitations (Sprint 002 §18).
3. Rerun `npm run build` and `npm test`; confirm the reader/graph/correlate/normalize paths pass against the real local shapes, and record any schema/semantic discrepancies versus the public fixtures.
4. Only after real local traces validate the conservative boundary, decide whether to proceed from `NormalizedEvent` into Work State reconstruction (the Sprint 003 boundary), which remains frozen for this sprint.

If a real local session later reveals schema differences Harnie cannot safely ingest, that would escalate this to NO-GO and must be reported before any papering-over.
