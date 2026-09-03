# Harnie Roadmap

## Product thesis

**AI coding work should outlive the agent that performed it.**

Coding agents increasingly persist sessions, context, tool activity, decisions, artifacts, and execution history. Today, that state remains coupled to the harness that created it.

Harnie makes coding-agent work a durable, local-first, harness-independent object.

The harness executes the work.

**Harnie owns the continuity of the work.**

---

## Product principles

### 1. Work, not agents

Harnie's primary object is **Work**.

An agent, harness, model, or session may perform an execution of that work, but none of them define the work itself.

### 2. Local first

Harnie begins entirely on the developer's machine.

No account, hosted service, remote database, or cloud synchronization is required.

### 3. Harness independent

Harnie's internal model must never depend on the persistence schema of Pi, OpenCode, Codex, Claude Code, or another harness.

Harness-specific representations stop at adapter boundaries.

### 4. Semantic portability over format translation

Harnie does not translate Pi sessions into OpenCode sessions or OpenCode sessions into Codex sessions.

It derives a harness-neutral representation of the meaningful state of work.

### 5. Provenance over inference

Derived decisions, findings, context, and next steps must remain traceable to source evidence.

Harnie should distinguish observed facts from derived interpretations.

### 6. Adopt beside existing tools

Developers should not need to replace their coding agent or change how they launch it to use early versions of Harnie.

Harnie initially operates beside existing harnesses rather than underneath them.

### 7. Prove continuity before orchestration

Harnie will not begin as:

- an agent harness
- an agent scheduler
- a sandbox
- an agent framework
- a model router
- a memory framework
- a multi-agent orchestrator
- a cloud execution runtime

The first problem is continuity of work.

---

# Phase 0 — Feasibility

## Goal

Prove that meaningful coding work can be reconstructed from an existing agent session without depending on that harness at handoff time.

### Initial path

**Pi → Harnie → OpenCode**

### Capabilities

- Initialize local Harnie state.
- Detect local Pi session storage.
- Import a real Pi coding session.
- Preserve raw source identity and provenance.
- Normalize the session into Harnie Work State.
- Inspect normalized work from the CLI.
- Generate a semantic handoff.
- Provide the handoff to OpenCode.
- Evaluate whether OpenCode can meaningfully continue the task.

### Success criteria

OpenCode should be able to determine, without the developer manually re-explaining the previous session:

- what the goal is
- what has already happened
- what files matter
- what decisions were made
- what remains unresolved
- what should happen next

This phase validates the product thesis.

---

# Phase 1 — Local Work State

## Goal

Turn the feasibility prototype into a reliable local representation of coding-agent work.

### Core domain

Introduce stable representations for:

- Work
- Workspace
- Execution
- Event
- Action
- Context
- Decision
- Finding
- Artifact
- Checkpoint
- NextStep
- Provenance

### CLI

Target surface:

```text
harnie init
harnie import pi
harnie list
harnie show <work>
harnie handoff <work> --to opencode
```

### Requirements

- SQLite persistence
- idempotent imports
- source provenance
- deterministic normalization where possible
- explicit derived-state labeling
- no modification of source harness data

---

# Phase 2 — Bidirectional Harness Support

## Goal

Prove that Harnie is an independent layer rather than a Pi migration utility.

### Harnesses

Initial target:

- Pi
- OpenCode

Then:

- Codex

Later candidate:

- Claude Code

### Capabilities

Each supported harness may provide some combination of:

- source detection
- session discovery
- session import
- normalization
- handoff generation

Support does not imply exact native resume.

### CLI (Phase 2)

```text
harnie import pi <path>
harnie import opencode <path>
harnie handoff <work> --to opencode
harnie handoff <work> --to pi
```

Handoffs are markdown from Work. Harnie does not write Pi JSONL or OpenCode SQLite.

### Validation

Demonstrate:

```text
Pi → Harnie → OpenCode
OpenCode → Harnie → Pi
Codex → Harnie → Pi/OpenCode
```

---

# Phase 3 — Work History

## Goal

Make Harnie useful even when no handoff occurs.

Harnie becomes the durable history of work performed across coding agents.

### Capabilities

```text
harnie history <work>
harnie executions <work>
harnie diff <execution-a> <execution-b>
```

Developers can answer:

- Which agents worked on this?
- What did each one do?
- What changed between executions?
- Which decisions survived?
- Where did an investigation diverge?
- What is currently unresolved?

---

# Phase 4 — Context Reconstruction

## Goal

Improve handoff quality without dumping entire transcripts into another model.

Harnie reconstructs the smallest useful context package for continuing work.

### Context may include

- active goal
- current repository revision
- relevant files
- changed files
- decisions
- findings
- failed approaches
- test state
- unresolved questions
- next steps
- source evidence

### Principle

**Transfer useful state, not accumulated tokens.**

---

# Phase 5 — Checkpoints and Forks

## Goal

Treat Work as a durable object that can evolve through multiple executions.

### Capabilities

```text
harnie checkpoint <work>
harnie fork <work>
```

Possible model:

```text
Work
 ├── Execution A — Pi
 ├── Execution B — OpenCode
 └── Fork
      └── Execution C — Codex
```

A fork represents a branch in the work, not necessarily a branch in a harness's internal conversation representation.

---

# Phase 6 — Work State Interchange

## Goal

Define a documented portable representation of Harnie Work State.

Possible capabilities:

```text
harnie export <work>
harnie import <file>
```

The format should preserve:

- semantic work state
- execution metadata
- source provenance
- schema version
- compatibility information

This is the earliest point where Harnie should consider formalizing an external Work State specification.

---

# Phase 7 — Machine Interface

## Goal

Allow other developer tools and agents to interact with Harnie directly.

Potential interfaces:

- structured CLI JSON
- library/API
- MCP
- agent integrations

Possible operations:

```text
list_work
get_work
get_work_context
create_checkpoint
prepare_handoff
```

This phase exposes Harnie as infrastructure without turning Harnie into the executing agent.

---

# Phase 8 — Multi-Machine Continuity

## Goal

Allow Work State to move safely between environments.

Potential capabilities:

- portable stores
- encrypted synchronization
- remote persistence
- team sharing

Cloud infrastructure remains optional.

The local Harnie database continues to be a first-class deployment model.

---

# Phase 9 — Work Coordination

## Goal

Explore multiple agents contributing to the same durable Work object.

Examples:

```text
Work
├── Pi — investigation
├── Codex — implementation
└── OpenCode — verification
```

This is intentionally late.

Coordination should emerge from a proven Work abstraction rather than Harnie prematurely becoming a multi-agent framework.

---

# Compatibility model

Harness interoperability is not binary.

Harnie defines capability levels.

## L0 — Archive

Preserve source session identity and source material.

## L1 — Inspect

Normalize enough state to inspect what happened.

## L2 — Handoff

Generate enough semantic state for another harness to meaningfully continue the work.

## L3 — Context Reconstruction

Reconstruct richer working context, including repository state, relevant artifacts, decisions, findings, and unresolved work.

## L4 — Native Resume

Reproduce execution context closely enough for native or near-native continuation.

L4 may not be possible between arbitrary harnesses.

**Harnie does not require L4 to succeed.**

---

# Near-term roadmap

The immediate sequence is:

```text
Feasibility
    ↓
Pi import
    ↓
Work State
    ↓
Inspection
    ↓
Semantic handoff
    ↓
OpenCode continuation
    ↓
Evaluate
```

Only after this path succeeds should Harnie expand its harness matrix.

---

# North star

A developer should eventually be able to stop thinking:

> Which agent contains my work?

and instead think:

> Which agent should continue my work?