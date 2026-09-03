# Sprint 002 Outcome - Pi Evidence Reader + Conservative Normalizer

Status: **GO**  
Evidence cutoff: 2026-09-01  
Prior pass: Conditional GO on 2026-08-28 (commit `b9c0d62`) because this machine had no local Pi sessions.

## Sprint question

> Can Harnie safely read real Pi evidence, preserve its original structure and provenance, diagnose structural problems, and normalize only the semantics supported by that evidence?

Answer: yes, for current Pi v3 JSONL. The conservative boundary holds on both the public-derived fixtures and two real locally emitted sessions.

## Why this is GO

The 2026-08-28 condition was concrete: validate the same source shapes against at least two representative user-local coding sessions, including one unfinished session, using strictly read-only capture.

That condition is now met:

| Trace | Records | What it proves |
|---|---:|---|
| E / Trace A coding | 31 | Local v3 header, write/read/bash tool calls, matched results, `isError: true` |
| F / Trace B unfinished | 13 | Local v3 header, parallel tool calls, investigation goal, final call with no result |

Local evidence agrees with the Sprint 001 model. No schema difference required inventing semantics at the ingestion boundary. No Pi loader was used.

## What remains bounded, not blocking

1. Trace A is a sandbox-permission probe (write `hello.txt`, blocked `~/.ssh` / `~/...` / `.env`), not a repository investigation or source-code edit. It is still real local coding-adjacent tool activity.
2. Trace B stops before a stated decision or refactoring plan. That is valid unfinished evidence; it is thin for later semantic derivation.
3. Original local filenames and the emitting Pi package version were not preserved.
4. Local-trace usage/cost objects were collapsed to a repeated canonical object during sanitization.
5. Compaction, branch, custom, and v4 records remain unobserved in committed fixtures.

These are later-sprint inputs, not NO-GO triggers.

## Implementation (unchanged from `56b5460`, now locally validated)

```text
Pi source evidence (read-only generic I/O)
        ↓
raw-preserving SourceRecord[]
        ↓
conservative NormalizedEvent[]  (message / tool_call / tool_result / command / unknown)
```

No SQLite Work Store, Work persistence, Work domain model, semantic derivation, OpenCode adapter, handoff, resume, cloud, sync, daemon, MCP, agent execution, or UI was added. The Sprint 002 freeze is still respected.

## Local vs public comparison

| Property | Public A–D | Local E–F | Result |
|---|---|---|---|
| Header | `{type:session, version:3, id, timestamp, cwd}` | Same | Agree |
| Family detection | `pi-session-v3` | `pi-session-v3` | Agree |
| Parent graph | Linear `parentId` chains | Linear `parentId` chains; no error diagnostics | Agree |
| Tool calls | Nested assistant `toolCall` blocks | Same | Agree |
| Correlation | `toolCallId`, never `parentId` | Same | Agree |
| Tool names | `bash`, `read`, `edit` | `write`, `read`, `bash` | Local adds committed `write` |
| Parallel calls | Fixture C | Trace B (3 reads, then 2 bash) | Agree, now locally evidenced |
| Missing result | Synthetic tests only | Trace B final `read` | Local unfinished case now real |
| `isError: true` | Not in public fixtures | Trace A denied `.env` write | New local evidence; still `tool_result` |
| Unknown records | `model_change`, `thinking_level_change` | Same, plus a second thinking-level change on Trace A | Agree |
| Direct `bashExecution` | Not in committed fixtures | Not in local traces | Still synthetic-only |
| v4 / compaction / branch / custom | Unobserved | Unobserved | Unchanged |

No local field required a new normalized event kind. `write` stays `tool_call`.

## Fixture inventory after this pass

| Fixture | Records | Entry IDs | Tool calls | Tool results |
|---|---:|---:|---:|---:|
| `minimal.jsonl` | 5 | 4 | 0 | 0 |
| `coding.jsonl` | 11 | 10 | 3 | 3 |
| `stateful-prefix.jsonl` | 14 | 13 | 6 | 6 |
| `model-transition.jsonl` | 6 | 5 | 0 | 0 |
| `trace-a-coding.jsonl` | 31 | 30 | 7 | 7 |
| `trace-b-unfinished.jsonl` | 13 | 12 | 6 | 5 |

## Automated tests

20 tests across 4 files, all passing:

- reader, including exact local trace counts and v3 family
- graph, including no-error parent graphs on both local traces
- correlation, including Trace A 7/7 matched calls and Trace B missing result
- normalization, including `write` remaining `tool_call`, `isError: true`, and exact provenance

## Security and privacy validation

- Original private Pi session files were not committed.
- A second sanitization pass removed a local username and host paths that survived the first pass (`user` instead of a personal account, `/workspace/pi-project` instead of `/private/tmp/...` and `/workspace/user/...`).
- No credentials, tokens, private keys, or environment dumps are present in committed fixtures.
- Read-only generic I/O only; no Pi loader.

## Decision

**GO.**

Harnie can safely read real local Pi v3 sessions, preserve raw evidence, keep chronology and parent graph intact, correlate tools conservatively, retain unknowns, and attach exact provenance. Local evidence materially agrees with Sprint 001. Trace B demonstrates unfinished work with enough structured evidence for later observed Work reconstruction.

## Sprint 003 recommendation

Begin Sprint 003: reconstruct **observed** Work State from `NormalizedEvent[]`.

Do not start semantic/model-assisted derivation, SQLite persistence, CLI commands, or OpenCode handoff in that sprint. Those remain later slices. The first Work object should be an evidence-backed projection of what the session already shows: workspace, execution/source session, chronological events, tool activity, and provenance.

Primary fixtures for that sprint: Trace B (unfinished) and public Fixture C (stateful prefix). Trace A is valid ingest evidence and a `write`/`isError` case, not a rich decision/finding source.
