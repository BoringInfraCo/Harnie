# Harnie Implementation Plan

## 1. Objective

Build the smallest implementation capable of testing Harnie's central hypothesis:

> A real coding session from one harness can be transformed into durable, harness-neutral Work State that enables another harness to meaningfully continue the work.

The initial validation path is:

```text
Pi
 ↓
Harnie
 ↓
OpenCode
```

This implementation plan intentionally prioritizes evidence over product breadth.

---

# 2. V0 scope

Implement:

```text
harnie init
harnie import pi
harnie list
harnie show <work>
harnie handoff <work> --to opencode
```

Support:

- local persistence
- Pi session discovery
- Pi session parsing
- normalized events
- Work creation
- basic semantic derivation
- provenance
- readable Work inspection
- OpenCode-oriented semantic handoff
- real-world continuation evaluation

Do not implement anything else unless required to complete this path.

---

# 3. Technology

Recommended initial stack:

- TypeScript
- Node.js
- SQLite
- lightweight CLI framework
- runtime schema validation
- built-in test runner or Vitest

Avoid framework-heavy architecture.

The experiment should remain easy to inspect and modify.

---

# 4. Repository structure

Initial target:

```text
harnie/
├── src/
│   ├── cli/
│   │   ├── init.ts
│   │   ├── import.ts
│   │   ├── list.ts
│   │   ├── show.ts
│   │   └── handoff.ts
│   │
│   ├── core/
│   │   ├── work.ts
│   │   ├── execution.ts
│   │   ├── event.ts
│   │   ├── action.ts
│   │   ├── context.ts
│   │   ├── decision.ts
│   │   ├── finding.ts
│   │   ├── artifact.ts
│   │   ├── checkpoint.ts
│   │   ├── next-step.ts
│   │   └── provenance.ts
│   │
│   ├── adapters/
│   │   └── pi/
│   │       ├── detect.ts
│   │       ├── sessions.ts
│   │       ├── parser.ts
│   │       └── normalize.ts
│   │
│   ├── engine/
│   │   ├── import.ts
│   │   ├── normalize.ts
│   │   ├── derive.ts
│   │   └── handoff.ts
│   │
│   ├── store/
│   │   ├── database.ts
│   │   ├── migrations/
│   │   └── repositories/
│   │
│   └── index.ts
│
├── tests/
│   ├── fixtures/
│   │   └── pi/
│   ├── adapter/
│   ├── core/
│   ├── engine/
│   └── cli/
│
├── ARCHITECTURE.md
├── IMPLEMENTATION.md
├── ROADMAP.md
└── README.md
```

Keep boundaries visible in the filesystem.

---

# 5. Step 1 — Establish domain primitives

Implement only the domain types required by V0.

Start with:

```text
Work
Workspace
Execution
Event
Action
Context
Decision
Finding
Artifact
NextStep
Provenance
```

Checkpoint may exist as a schema without a public command initially.

Every object should have:

- stable ID
- timestamps where meaningful
- schema validation
- explicit provenance where applicable

Avoid adding fields based on speculation.

Real Pi data should drive schema expansion.

---

# 6. Step 2 — Establish SQLite store

Create:

```text
~/.harnie/harnie.db
```

Initial tables should map closely to the core domain.

Possible tables:

```text
works
workspaces
executions
source_sessions
events
actions
contexts
decisions
findings
artifacts
next_steps
checkpoints
provenance
```

Prefer explicit relational tables over storing the entire domain as opaque JSON.

JSON fields remain acceptable for variable event payloads.

---

# 7. Step 3 — Implement `harnie init`

Responsibilities:

- create Harnie home directory
- create SQLite database
- apply migrations
- report resulting location
- be idempotent

Example:

```text
$ harnie init

Initialized Harnie.

Store
~/.harnie/harnie.db
```

No account setup.

No configuration wizard.

---

# 8. Step 4 — Collect real Pi fixtures

Before writing the complete Pi adapter, capture representative sessions.

Fixtures should include:

### Fixture A

Simple conversation.

### Fixture B

Coding task involving:

- file reads
- file modifications
- shell commands
- tool results

### Fixture C

Longer session containing:

- architectural reasoning
- decisions
- failed approach
- successful approach
- unfinished work

### Fixture D

Branched or compacted session if practical.

Fixtures must be sanitized before being committed.

The adapter should be developed against real structures rather than invented examples.

---

# 9. Step 5 — Pi detection

Implement:

```text
PiAdapter.detect()
```

Responsibilities:

- locate known Pi session storage
- identify whether sessions exist
- return explicit unsupported states

Do not modify Pi storage.

---

# 10. Step 6 — Pi session discovery

Implement:

```text
PiAdapter.sessions()
```

Return normalized metadata:

```text
SourceSessionSummary
├── source_id
├── workspace?
├── started_at?
├── updated_at?
└── source_location
```

This layer should not perform semantic interpretation.

---

# 11. Step 7 — Pi parser

Parse Pi JSONL into source-specific typed records.

Architecture:

```text
JSONL
 ↓
Pi parser
 ↓
PiSessionEntry[]
```

Preserve unknown records.

Do not discard data merely because Harnie does not understand it yet.

Parser tests should operate directly against sanitized real fixtures.

---

# 12. Step 8 — Pi normalization

Transform Pi-specific records into Harnie normalized events.

```text
PiSessionEntry
      ↓
PiNormalizer
      ↓
NormalizedEvent
```

Examples:

```text
Pi user message
→ message event

Pi assistant message
→ message event

Pi tool invocation
→ tool_call/action

Pi tool result
→ tool_result

Pi file operation
→ file_read/file_write where identifiable
```

Every normalized record retains source provenance.

---

# 13. Step 9 — Import engine

Implement:

```text
harnie import pi
```

Pipeline:

```text
discover
 ↓
select session(s)
 ↓
read
 ↓
parse
 ↓
normalize
 ↓
associate/create Work
 ↓
persist
```

Initial UX may allow explicit session selection rather than trying to automatically infer perfect Work grouping.

Correctness is more important than convenience.

---

# 14. Step 10 — Idempotent import

Import identity should use:

```text
harness
source_session_id
source_event_id
```

Expected behavior:

```text
First import
+ 182 events

Second import
+ 0 events

Pi session continues

Third import
+ 24 events
```

This is required before considering the importer reliable.

---

# 15. Step 11 — Work derivation

Create a derivation layer separate from parsing and normalization.

Input:

```text
Normalized events
```

Output:

```text
goal
current state
decisions
findings
artifacts
next steps
```

The first implementation may combine deterministic extraction and model-assisted semantic derivation.

The system must record which mechanism produced each derived object.

---

# 16. Step 12 — Deterministic derivation first

Extract anything that does not require model interpretation directly.

Examples:

- workspace path
- repository
- branch
- revision
- files accessed
- files changed
- commands executed
- tests executed
- source harness
- model
- timestamps

Do not ask a model to infer information already represented structurally.

---

# 17. Step 13 — Semantic derivation

Use model-assisted derivation only for concepts such as:

- goal
- decision
- rationale
- finding
- current state
- unresolved issue
- next step

The derivation prompt should require evidence references.

Conceptually:

```text
Derived claim
      ↓
source event IDs
```

Unsupported claims should not be persisted.

---

# 18. Step 14 — Implement `harnie list`

Example:

```text
$ harnie list

WORK        STATUS    LAST HARNESS   UPDATED
oauth-fix   paused    pi             12m ago
provider    active    pi             2h ago
```

Keep V0 output functional rather than decorative.

---

# 19. Step 15 — Implement `harnie show`

Example:

```text
$ harnie show oauth-fix

Goal
Fix OAuth callback state validation.

Status
Paused

Workspace
~/Developer/example

Execution
Pi / Claude

Current state
OAuth callback implementation exists but state
validation fails after redirect.

Decisions
• Preserve existing Provider interface.

Findings
• Stored OAuth state differs from callback state.

Artifacts
• src/auth/oauth.ts
• tests/oauth.test.ts

Next
Trace state persistence across redirect.

Provenance
Pi session 83929
```

The command should make Harnie's abstraction immediately understandable.

---

# 20. Step 16 — Handoff builder

Implement a harness-neutral internal representation:

```text
Handoff
├── goal
├── current_state
├── workspace
├── revision
├── relevant_context
├── decisions
├── findings
├── completed_work
├── unresolved_work
├── artifacts
├── test_state
├── next_steps
└── provenance
```

The Handoff object is generated from Work State.

It is not generated directly from Pi.

That boundary is mandatory.

---

# 21. Step 17 — OpenCode handoff renderer

Implement:

```text
Handoff
 ↓
OpenCode renderer
 ↓
handoff content
```

The first version does not need to mutate OpenCode's SQLite database or manufacture a native OpenCode session.

The safest V0 is an explicit handoff artifact that OpenCode can consume through its supported interaction surface.

This proves semantic portability without coupling Harnie to OpenCode persistence.

---

# 22. Step 18 — Implement `harnie handoff`

Target:

```text
harnie handoff <work> --to opencode
```

Initial behavior may:

1. construct Handoff
2. render it for OpenCode
3. expose or launch the supported continuation path
4. preserve a record that the handoff occurred

Exact UX should be chosen only after validating OpenCode's safest supported input mechanism.

---

# 23. Step 19 — Real dogfood experiment

Use an actual repository and actual task.

Protocol:

### A. Start in Pi

Give Pi a non-trivial coding task.

Allow it to:

- investigate
- read files
- execute commands
- make decisions
- modify code
- reach an unfinished but meaningful state

Stop.

### B. Import

```text
harnie import pi
```

### C. Inspect

```text
harnie show <work>
```

Manually verify Harnie's representation against what actually happened.

### D. Handoff

```text
harnie handoff <work> --to opencode
```

### E. Continue

Ask OpenCode only:

```text
Continue the work.
```

Do not manually summarize the Pi session.

---

# 24. Step 20 — Evaluate continuation

Score the handoff against explicit questions.

Can OpenCode identify:

- the original goal?
- completed work?
- important files?
- decisions already made?
- failed approaches?
- current repository state?
- unresolved problem?
- appropriate next step?

Then observe behavior.

Does OpenCode:

- unnecessarily repeat investigation?
- contradict previous decisions?
- inspect irrelevant files?
- misunderstand current state?
- make a correct next change?

---

# 25. V0 success threshold

Harnie does not need perfect replay.

The experiment succeeds if OpenCode can **meaningfully continue the Pi work with substantially less developer re-explanation than starting a fresh session.**

The qualitative comparison is:

```text
Fresh OpenCode session

versus

OpenCode + Harnie handoff
```

Harnie should materially reduce context reconstruction.

---

# 26. V0 failure conditions

The experiment should be considered unsuccessful if:

- important state cannot be recovered from Pi
- derivation consistently invents unsupported decisions/findings
- the handoff approaches transcript size
- OpenCode must repeat most prior investigation
- the developer still has to manually explain the task
- normalized state is effectively just a reformatted transcript

Failure is useful evidence.

Do not expand scope to hide a failed abstraction.

---

# 27. Test strategy

Tests should cover four layers.

## Adapter

Real sanitized Pi fixtures parse correctly.

## Normalization

Pi-specific records produce stable normalized events.

## Domain/store

Work State persists and reloads without harness knowledge.

## Handoff

Known Work State produces deterministic handoff structure.

Semantic model output should be tested through schema and evidence constraints rather than brittle exact-string assertions.

---

# 28. Security requirements

V0 must:

- read harness state without mutation
- avoid persisting obvious secrets when identifiable
- never replay recorded commands automatically
- never interpret previous tool permission as current authorization
- avoid cloud transmission except explicit model calls required for semantic derivation
- clearly document when data leaves the local machine

A future fully local derivation path may remove the last external dependency.

---

# 29. Implementation order

Build in this order:

```text
1. Domain types
2. SQLite store
3. harnie init
4. Real Pi fixtures
5. Pi detection
6. Pi discovery
7. Pi parser
8. Pi normalization
9. Import engine
10. Idempotency
11. Deterministic derivation
12. Semantic derivation
13. harnie list
14. harnie show
15. Handoff model
16. OpenCode renderer
17. harnie handoff
18. Real dogfood test
19. Evaluation
```

Do not begin the next product phase until the final experiment is evaluated.

---

# 30. What comes after V0

If the experiment succeeds, the next implementation should **not automatically be more features**.

The next question becomes:

> Can OpenCode be implemented as a source adapter and handed back to Pi using the same Work State?

That test proves whether Harnie is truly harness-independent.

Only then should Codex support follow.

---

# 31. Implementation north star

The first version of Harnie should make this possible:

```text
Pi worked on it.

Harnie knows what happened.

OpenCode can continue it.
```

If we can prove those three statements with a real coding task, Harnie has earned the right to become a product.