# Sprint 003 — Observed Work State from Normalized Events
**Status:** Complete — GO
**Phase:** 0 — Feasibility
**Type:** Implementation / evidence validation
**Depends on:** Sprint 002 — GO

## Objective

Build the next Harnie layer: a harness-neutral **observed** Work projection from conservative `NormalizedEvent[]`.

This sprint establishes:

```text
what the harness persisted
        ↓
what Harnie can safely observe
        ↓
what Harnie may later derive
```

Sprint 002 implemented the first two layers. Sprint 003 implements the third layer only for facts that do not require a model.

It does not produce OpenCode handoff, and it does not invent goals, decisions, or findings.

## Sprint question

Can Harnie turn a normalized Pi session into a Work object that is useful without the original harness, while remaining strictly traceable to source evidence?

## Background

Sprint 002 proved local Pi v3 compatibility. Normalized events now exist for public fixtures A–D and local traces E–F.

The recoverability matrix says:

- Directly observed: workspace cwd, messages, tool activity, physical chronology, source session identity.
- Derivable later: goal, decisions, findings, relevant files, artifacts, unresolved work, next steps.
- Not available from a v3 session alone: git revision, durable filesystem state, native resume, emitter package version.

Sprint 003 must not collapse those three classes.

## Scope

### 1. Smallest Work types

Introduce only the domain types required to represent one imported session as observed Work:

```text
Work
Workspace
Execution
SourceSession
Event
Provenance
```

Action, Context, Decision, Finding, Artifact, NextStep, and Checkpoint may exist as TypeScript types only if tests need a placeholder. Do not populate them from inference.

Exact field lists should follow `ARCHITECTURE.md` and shrink if a field has no evidence in the current fixtures.

### 2. Observed reconstruction pipeline

```text
NormalizedEvent[]
        ↓
ObservedWorkBuilder
        ↓
Work
 ├── workspace (from session cwd)
 ├── executions[] (one per source session in this sprint)
 └── events[] (normalized chronology with provenance)
```

Initial association rule: one Pi source session becomes one Work and one Execution. Do not attempt multi-session Work grouping.

### 3. What may be copied as observed

- workspace path from the v3 session header `cwd`
- source session id, harness, source family
- started_at / updated_at from timestamps actually present
- provider/model when a `model_change` or assistant envelope records them
- chronological normalized events
- tool names, arguments, results, `isError`, missing results
- provenance back to line, entry, content index, and toolCallId

### 4. What must remain unlabeled or later-derived

Do not persist as observed facts:

- goal
- decisions
- findings
- next steps
- “relevant files”
- file_read / file_write / command specialization from tool names
- git repository / branch / revision
- current filesystem contents

A later sprint may add a convention-based `operation` facet on `tool_call` events. Sprint 003 must not promote `write`/`read`/`edit`/`bash` into those event kinds.

### 5. Unfinished work

Trace B must reconstruct without repairing the missing final tool result. The Work object should still be valid. Missing results stay diagnostics on the evidence, not failures of Work creation.

### 6. Tests

Cover at least:

- Trace B reconstructs one Work, one Execution, v3 source session, workspace `/workspace/pi-project`
- Trace A reconstructs write/read/bash as `tool_call` / `tool_result`, including `isError: true`
- Fixture C reconstructs without inventing a Decision object
- every Work event retains provenance to a source line
- a second reconstruction of the same events is deterministic (same ids given the same source identities)

### 7. Explicit freezes

Do **not** implement:

- SQLite Work Store
- `harnie init` / `import` / `list` / `show` / `handoff`
- semantic or model-assisted derivation
- OpenCode adapter or handoff
- multi-session Work grouping
- native resume
- cloud, sync, daemon, MCP, UI, agent execution

## Decision criteria

**GO** if a local unfinished session becomes a Work object a developer can inspect for workspace, source identity, chronology, and tool activity, with every claim pointing at source evidence.

**CONDITIONAL GO** if reconstruction works but a bounded identity or timestamp gap remains, documented with a later-sprint condition.

**NO-GO** if Harnie cannot represent unfinished local work without guessing, or if reconstruction silently drops provenance.

## Sprint north star

Know what happened in the session before deciding what the work means.
