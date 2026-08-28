# Harnie Architecture

## 1. Purpose

Harnie is a local-first, harness-independent work-state layer for AI coding agents.

It separates **the durable state of engineering work** from **the harness and model temporarily executing that work**.

The architectural relationship is:

```text
Work
  ↓
Execution
  ↓
Harness
  ↓
Model
```

Work persists.

Executions happen.

Harnesses and models may change.

---

# 2. Core architectural rule

**Harness-specific state must never leak into Harnie's domain model.**

Pi JSONL is Pi's representation.

OpenCode SQLite is OpenCode's representation.

Codex rollout JSONL is Codex's representation.

Harnie adapters may understand those formats.

Harnie core may not.

---

# 3. System architecture

```text
┌──────────────────────────────────────────────┐
│                    CLI                       │
│                                              │
│ init   import   list   show   handoff        │
└──────────────────────┬───────────────────────┘
                       │
              ┌────────▼─────────┐
              │   Application    │
              │     Services     │
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │   Work Engine    │
              │                  │
              │ normalization    │
              │ derivation       │
              │ provenance       │
              │ handoff          │
              └────────┬─────────┘
                       │
              ┌────────▼─────────┐
              │    Work Store    │
              │     SQLite       │
              └────────▲─────────┘
                       │
           ┌───────────┼────────────┐
           │           │            │
      ┌────┴────┐ ┌────┴─────┐ ┌────┴─────┐
      │   Pi    │ │ OpenCode │ │  Codex   │
      │ Adapter │ │ Adapter  │ │ Adapter  │
      └────▲────┘ └────▲─────┘ └────▲─────┘
           │           │            │
         JSONL       SQLite       JSONL
```

---

# 4. Primary domain object: Work

A Work object represents an ongoing unit of developer intent.

Examples:

- investigate a bug
- implement authentication
- refactor a provider
- understand an unfamiliar repository
- complete a sprint
- diagnose a failing deployment

Work is intentionally independent of a conversation or agent session.

```text
Work
├── id
├── title
├── goal
├── status
├── workspace
├── executions[]
├── context[]
├── decisions[]
├── findings[]
├── artifacts[]
├── checkpoints[]
├── next_steps[]
├── created_at
└── updated_at
```

---

# 5. Workspace

Workspace describes where the work applies.

```text
Workspace
├── path
├── repository?
├── branch?
└── revision?
```

A workspace is context, not identity.

Harnie should not assume Git is present.

---

# 6. Execution

Execution represents a period in which a harness/model performed work.

```text
Execution
├── id
├── work_id
├── harness
├── harness_version?
├── model?
├── provider?
├── source_session
├── started_at
├── ended_at?
└── status
```

Example:

```text
Work: OAuth callback bug

Execution 1
  harness: pi
  model: claude

Execution 2
  harness: opencode
  model: minimax

Execution 3
  harness: codex
  model: gpt
```

Executions belong to Work.

Work does not belong to an execution.

---

# 7. Source Session

A Source Session identifies the original harness representation.

```text
SourceSession
├── harness
├── source_id
├── source_location?
├── source_version?
└── imported_at
```

Harnie must not modify source sessions.

Import is observational.

---

# 8. Events

Events preserve normalized chronological activity.

```text
Event
├── id
├── work_id
├── execution_id
├── kind
├── timestamp
├── payload
└── provenance
```

Initial kinds may include:

```text
message
tool_call
tool_result
command
file_read
file_write
```

The event taxonomy should remain deliberately small until real harness data demonstrates a need for expansion.

---

# 9. Actions

Actions represent meaningful operations performed during execution.

```text
Action
├── id
├── execution_id
├── kind
├── input?
├── output?
├── status
├── started_at?
├── ended_at?
└── provenance
```

Events preserve chronology.

Actions provide useful operational structure.

---

# 10. Context

Context represents information materially relevant to continuing the work.

```text
Context
├── id
├── kind
├── reference
├── summary?
├── relevance?
└── provenance
```

Possible kinds:

```text
file
directory
repository
documentation
command_output
external_reference
```

Harnie should prefer references over duplicating large content.

---

# 11. Decisions

Decisions represent choices that affect subsequent work.

```text
Decision
├── id
├── summary
├── rationale?
├── evidence[]
├── confidence?
└── provenance
```

Decisions may be explicitly observed or derived.

Harnie must preserve that distinction.

---

# 12. Findings

Findings represent meaningful discoveries.

```text
Finding
├── id
├── statement
├── evidence[]
├── confidence?
└── provenance
```

Examples:

```text
OAuth state validation fails after redirect.

Provider IDs are persisted before enrichment.

This test fails only when run in the full suite.
```

---

# 13. Artifacts

Artifacts represent outputs created or modified during work.

```text
Artifact
├── id
├── kind
├── reference
├── operation?
├── revision?
└── provenance
```

Examples:

- source file
- test
- patch
- generated document
- configuration file

Harnie should generally reference repository files rather than copy their contents.

---

# 14. Next Steps

NextStep represents unfinished work.

```text
NextStep
├── id
├── description
├── status
├── priority?
└── provenance
```

This is particularly important for cross-harness handoff.

---

# 15. Checkpoints

A Checkpoint represents a durable snapshot of semantic work state.

```text
Checkpoint
├── id
├── work_id
├── execution_id?
├── summary
├── created_at
└── provenance
```

A checkpoint is not required to reproduce a harness's internal runtime.

It captures Harnie's understanding of the work at a point in time.

---

# 16. Provenance

Provenance is a first-class architectural primitive.

Every derived object should be traceable.

```text
Provenance
├── source_type
├── source_session
├── source_event?
├── source_location?
├── observed_at
└── derivation?
```

Example:

```text
Decision
  "Preserve Provider interface"

Provenance
  harness: pi
  session: 83929
  event: a83c
```

Harnie should be able to answer:

> Why do you believe this?

---

# 17. Observed vs derived state

Harnie distinguishes two classes of information.

## Observed

Directly represented by source data.

Examples:

- command executed
- file read
- user message
- tool call
- model identifier

## Derived

Interpreted from source information.

Examples:

- goal
- decision
- finding
- next step
- summarized current state

Derived data must contain provenance.

Derived data must never silently replace source evidence.

---

# 18. Adapter architecture

Every harness integration implements a stable adapter contract.

Conceptually:

```text
Adapter
├── detect()
├── version()
├── sessions()
├── read(session)
└── normalize(session)
```

Responsibilities:

### `detect`

Determine whether the harness exists locally and whether Harnie recognizes its storage format.

### `version`

Identify relevant harness/storage version when possible.

### `sessions`

Enumerate available source sessions.

### `read`

Read source data without mutation.

### `normalize`

Produce Harnie-normalized records.

---

# 19. Adapter isolation

Adapters may depend on:

- harness paths
- harness schemas
- harness versions
- migration history
- source-specific event types

Core Harnie code may not.

Bad:

```text
core.work.decision =
  opencode.part.data.decision
```

Good:

```text
OpenCodeAdapter
  ↓
NormalizedEvent
  ↓
WorkEngine
  ↓
Decision
```

---

# 20. Normalization pipeline

```text
Source Session
      ↓
Harness Adapter
      ↓
Normalized Events
      ↓
Work Engine
      ↓
Observed Work State
      ↓
Semantic Derivation
      ↓
Derived Work State
```

Normalization and semantic derivation are separate stages.

This prevents harness parsing from becoming coupled to interpretation.

---

# 21. Handoff architecture

Harnie does not convert native session formats.

Never:

```text
Pi JSONL
   ↓
OpenCode SQLite
```

Instead:

```text
Pi JSONL
   ↓
Pi Adapter
   ↓
Work State
   ↓
Handoff Builder
   ↓
Harness-neutral handoff
   ↓
OpenCode
```

The receiving harness consumes the meaning of the previous work rather than pretending to inherit its proprietary runtime.

---

# 22. Handoff package

An L2 handoff should prioritize:

```text
goal
current state
workspace
repository revision
important context
decisions
findings
completed work
unresolved work
relevant artifacts
test state
next steps
provenance
```

The package should be significantly smaller than the original transcript whenever possible.

---

# 23. Compatibility levels

Adapters expose supported capabilities.

```text
L0 Archive
L1 Inspect
L2 Handoff
L3 Context Reconstruction
L4 Native Resume
```

Harnie must never imply a compatibility level an adapter cannot provide.

---

# 24. Persistence

Initial persistence:

```text
~/.harnie/
├── harnie.db
└── sources/
```

SQLite is the canonical local Work Store.

The database contains normalized Harnie state.

Raw source material should only be copied when necessary for archival/provenance requirements.

---

# 25. Idempotency

Importing the same source session repeatedly must not duplicate work.

Identity should derive from stable source information where available:

```text
harness
source_session_id
source_event_id
```

Imports should support incremental updates to sessions that are still evolving.

---

# 26. Security boundary

Harnie V0 reads local agent state.

It should not:

- execute arbitrary session commands
- automatically replay tool calls
- inherit harness permissions
- expose secrets unnecessarily
- mutate source databases
- upload session content

A recorded action is data.

It is not authorization to execute that action again.

---

# 27. Failure model

Harnie should prefer partial truth over fabricated completeness.

If an adapter cannot interpret an event:

```text
unknown source event
```

is better than guessing.

If semantic derivation is uncertain, uncertainty should be represented.

Unsupported source versions should fail explicitly.

---

# 28. Architectural freezes for V0

Until feasibility is demonstrated, Harnie will not introduce:

- cloud persistence
- accounts
- remote synchronization
- daemon architecture
- agent scheduling
- sandbox execution
- model routing
- native agent harness
- multi-agent coordination
- autonomous execution
- generic memory APIs
- web UI

These are not rejected permanently.

They are outside the proof Harnie needs first.

---

# 29. V0 data flow

```text
Real Pi Session
      ↓
Pi Adapter
      ↓
Normalized Events
      ↓
Work Engine
      ↓
SQLite Work State
      ↓
CLI Inspection
      ↓
Handoff Builder
      ↓
OpenCode Handoff
      ↓
Continuation Evaluation
```

---

# 30. Architectural north star

The architecture succeeds when this statement is true:

> A Harnie Work object remains useful even if the harness that originally created it no longer exists.