# Harnie CLI machine contract (`harnie.cli.v1`)

This document specifies the stable machine interface for the Harnie CLI: the
opt-in `--json` envelope, the error-code table, and the per-command data
shapes. It covers the inspection and handoff commands: `list`, `show`,
`executions`, `history`, `diff`, `handoff`, and `sessions`.

The contract is implemented in `src/contract/` (`envelope.ts`, `errors.ts`,
`flags.ts`) and consumed by the command files in `src/cli/`. The schema
version constant is `CLI_JSON_SCHEMA` in `src/contract/envelope.ts` — the one
place the version is defined.

## Invocation model

- `--json` is a per-command flag placed anywhere in the command's arguments:
  `harnie show <work> --json`, `harnie list --json`, …
- JSON mode is decided by the presence of `--json` in the argument list, so
  even a malformed command (unknown flag, duplicate flag) answers with a JSON
  envelope when `--json` was requested.
- Without `--json`, every command prints exactly the human-readable text it
  printed before the contract existed — byte-for-byte, including error
  messages on stderr. Text mode never prints error codes.
- `init`, `import`, `checkpoint`, `fork`, `backup`, and `restore` do not
  support `--json` in this version.

## Envelope

Exactly one JSON document is written per invocation, newline-terminated.
**Both success and failure envelopes go to stdout.** stderr remains reserved
for human diagnostics in text mode, so a machine consumer only parses stdout;
the process exit code still signals failure (0 on success, 1 on failure).

Key order is part of the contract (insertion order of the literals that build
the envelope):

```jsonc
// success
{ "schema": "harnie.cli.v1", "command": "list", "ok": true, "data": … }

// failure
{ "schema": "harnie.cli.v1", "command": "show", "ok": false,
  "error": { "code": "not_found", "message": "Work not found: work:pi:missing" } }
```

### Determinism

- Same store state + same arguments ⇒ byte-identical stdout. No timestamps,
  randomness, or locale-sensitive formatting are introduced by the CLI.
- Timestamps that appear (`updatedAt`, `startedAt`, `createdAt`) are fields
  already persisted in the store.
- Object key order elsewhere is the documented insertion order of each data
  shape below. Arrays keep their store/builder order (e.g. `list` rows are
  ordered by the store query: `updated_at DESC, id`).
- Data strings are the same redacted strings the text commands render
  (ingestion redaction plus the output-path redaction backstop); `show --json`
  redacts all free-text fields and reports the number of output-pass
  redaction spans as `redactions`. The count reflects spans applied during
  the output pass only: builder-level `[REDACTED:*]` markers already present
  in `derived` are idempotent and are not double-counted
  (`tests/cli-json-redaction.test.ts`).

## Error codes

Defined in `src/contract/errors.ts` (`CLI_ERROR_CODES`). Codes may gain new
members but existing codes never change meaning or spelling.

| Code | Meaning | Example |
| --- | --- | --- |
| `usage` | Argument shape does not match the command's grammar beyond a single missing piece | `harnie list foo` |
| `unknown_command` | Router-level; text-only (the router cannot know the requested schema) | `harnie frobnicate` |
| `unknown_flag` | A flag the command does not accept | `harnie show <work> --dry-run --json` |
| `duplicate_flag` | The same flag given twice | `harnie show <work> --json --json` |
| `missing_argument` | A required argument or flag value is absent | `harnie show` with no work id |
| `not_found` | Work, execution, checkpoint, or file does not exist | `Work not found: <id>` |
| `invalid_input` | Argument present but malformed | `harnie sessions --harness claude` |
| `store_error` | Store/work layer failure (fallback classification) | unreadable database |
| `unsupported` | Syntactically valid but not implemented | `harnie handoff <work> --to foobar` |

Text mode keeps the historical messages and streams for all of these (usage on
stderr, `Target "foobar" is not implemented.`, …); only JSON mode adds the
codes. Thrown store/work-layer errors are classified by message prefix
(`Work not found: …`, `Execution not found: …`, `Checkpoint not found: …`,
`Session file not found: …` → `not_found`; anything else → `store_error`).

## Flag hardening

All commands reject unknown flags and duplicate flags with exit 1 (stable code
in JSON mode). Help short-circuits are not exempt: `--help`/`-h` print help and
exit 0 only when the rest of the argv parses cleanly — an unknown or duplicate
flag next to `--help` (e.g. `harnie backup --help --bogus`) is rejected with
exit 1 exactly as in normal execution. Previously the import parser silently
skipped unknown flags and ignored duplicate `--work` values; fork silently kept
the first `--checkpoint`; sessions silently kept the first `--harness`. These
now fail: import prints `Unknown flag: <flag>` / `Duplicate flag: <flag>`
followed by its usage, fork prints the message, and the JSON commands emit the
matching code. Both `--flag value` and `--flag=value` spellings are accepted
everywhere.

## Per-command data shapes

Field names mirror the internal TypeScript structures (`src/store/query.ts`,
`src/work/handoff.ts`, `src/work/diff.ts`) — camelCase like the codebase,
except event-count keys which are the event kinds themselves (`tool_call`,
`tool_result`). Optional fields are omitted (not `null`) when absent.

### `list --json`

```jsonc
{ "works": [ { "id": "work:pi:…", "workspacePath": "/…", "harness": "pi",
               "provider": "…", "model": "…", "updatedAt": "2026-09-01T00:00:13.000Z",
               "eventCount": 18 } ] }
```

An empty store yields `{ "works": [] }` (text mode prints `No observed work.`).

### `show <work> --json`

```jsonc
{
  "work": {                       // persisted observed data
    "id", "createdAt?", "updatedAt?", "workspacePath?",
    "forkedFrom?": { "workId", "checkpointId?", "message?" },
    "executions": [ { "id", "harness", "provider?", "model?",
                      "sourceSession": { "sourceId", "sourceFormat?" }, "startedAt?" } ],
    "goal?": { "statement", "evidence", "rule" },
    "decisions": [ { "id", "summary", "evidence" } ],
    "findings":  [ { "id", "statement", "evidence" } ],   // full persisted list
    "nextSteps": [ { "id", "description", "evidence" } ],
    "operations?": [ { "toolName?", "path?", "command?", "status", "note?", "evidence" } ]
  },
  "derived": {                    // buildHandoffFromWork output (redacted, budgeted)
    "goal?", "currentState?", "decisions", "findings", "nextSteps",
    "operations", "filesTouched", "revision?", "relevantFiles?", "changedFiles?",
    "failedApproaches?", "testState?", "verification?", "readYields?",
    "unresolved?", "evidence?",
    "budget": { … },              // explicit truncation, see below
    "evidenceRefs": { … }
  },
  "checkpoints": [ { "id", "executionId?", "message", "createdAt", "eventCount" } ],
  "eventCounts": { "message", "tool_call", "tool_result", "command", "unknown" },
  "diagnosticCodes": ["missing_tool_result"],
  "redactions": 0,                // true output-pass redaction span count (builder-level
                                  // markers in `derived` are idempotent, not re-counted)
  "provenance": "observed"
}
```

`work.findings` is the complete persisted list; `derived.findings` is the
budgeted/capped view. Truncation is explicit (below).

### `executions <work> --json`

```jsonc
{ "workId": "work:pi:…",
  "executions": [ { "id", "harness", "provider?", "model?", "sourceSessionId",
                    "sourceFormat?", "startedAt?",
                    "eventCounts": { "message", "tool_call", "tool_result", "command", "unknown" },
                    "eventCount": 18 } ] }
```

### `history <work> --json`

```jsonc
{ "workId", "forkedFrom?", "workspacePath?", "goal?",
  "executions": [ { "id", "harness", "provider?", "model?", "sourceSessionId",
                    "startedAt?", "eventCounts": { … } } ],
  "checkpoints": [ { "id", "executionId?", "message", "createdAt", "eventCount" } ],
  "decisions": ["…"],   // summaries, uncapped (same as text history)
  "findings": ["…"],    // statements, uncapped
  "nextSteps": ["…"] }  // descriptions, uncapped
```

### `diff <work> <a> <b> --json`

```jsonc
{ "workId", "fromId", "toId",
  "fromCounts": { … }, "toCounts": { … },
  "decisions":  { "kept": ["…"], "added": ["…"], "removed": ["…"] },
  "findings":   { "kept": […], "added": […], "removed": […] },
  "nextSteps":  { "kept": […], "added": […], "removed": […] },
  "operations": { "kept": […], "added": […], "removed": […] } }
```

### `handoff <work> --to <target> [--checkpoint <id>] --json`

JSON mode writes the Markdown package to
`$HARNIE_HOME/handoffs/<work>[.<checkpoint>].<target>.md` exactly as text mode
does, and prints the structure instead of the Markdown on stdout:

```jsonc
{
  "workId", "target": "opencode" | "pi" | "codex" | "grok", "checkpointId?", "file": "/abs/path.md",
  "sections": { "goal?", "currentState?", "decisions", "findings", "nextSteps",
                "operations", "filesTouched", "revision?", "relevantFiles?",
                "changedFiles?", "failedApproaches?", "testState?", "verification?",
                "readYields?", "unresolved?", "evidence?" },
  "budget": { … }, "evidenceRefs": { … },
  "eventCounts": { … }, "diagnosticCodes": […],
  "provenance": { "from": "work", "sourceHarness?", "sourceSession?" }
}
```

### `sessions [--harness …] --json`

```jsonc
{ "scans": [ { "harness": "pi" | "opencode" | "codex" | "grok",
               "locations": ["…"],       // roots/db paths that were scanned
               "omitted": 0,             // older sessions hidden by the per-harness cap
               "sessions": [ { "harness", "sessionId", "project", "updatedAt",
                               "importCommand" } ] } ] }
```

Empty scans are included (with their locations) rather than dropped, so a
machine can tell "nothing there" from "not scanned".

## Explicit truncation

JSON output never silently drops data. Truncation is reported through the
`budget` object produced by `buildHandoffFromWork` (`src/work/handoff.ts`),
exposed as data by `show --json` (inside `derived`) and `handoff --json`:

- `budget.limits` — the caps themselves (`itemChars`, `sectionChars`,
  `totalChars`), so consumers can tell truncation from emptiness without
  scraping prose.
- `budget.omittedItems` — items hidden per section key: budget drops, the
  findings cap (keep-last-5), and the executions cap.
- `budget.truncatedItems` — items cut by the per-item character limit.
- `budget.omittedChars` — approximate characters removed per section.
- `budget.boundedChars` / `budget.withinBudget` — measured size after budgeting.
- `evidenceRefs` — per-item evidence references aligned with the
  `decisions`/`findings`/`nextSteps` item lists, so agents can follow
  provenance instead of scraping Markdown.

The Markdown renderers (`harnie handoff` text mode, `show` text mode) use the
same builder, so both modes agree on what was truncated.

## Compatibility rules

1. Adding a new command or a new field inside `data` is not a breaking change.
2. Removing or renaming a field, changing a field's type, or changing the
   envelope key order requires bumping `schema` to `harnie.cli.v2` and
   updating this document and the README section.
3. Error codes are only added to, never removed from, the table above.
4. Text output is not covered by the machine contract; it may be improved
   between releases, while `--json` output follows the rules above.
