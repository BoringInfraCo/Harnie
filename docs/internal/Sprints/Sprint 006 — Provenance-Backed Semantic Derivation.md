# Sprint 006 — Provenance-Backed Semantic Derivation
**Status:** Complete — GO
**Phase:** 0 — Feasibility
**Type:** Implementation
**Depends on:** Sprint 005 — GO

## Objective

Derive goal, decisions, findings, and next steps from observed Work without replacing source evidence.

```text
Observed Work
        ↓
derived claims with provenance
        ↓
harnie show includes derived sections only when evidence exists
```

## Sprint question

Can Harnie state what the work means, with every claim pointing at source events, and refuse to persist unsupported claims?

## Scope

1. Domain types for Decision, Finding, NextStep, and an optional Work.goal — each with provenance and `observation: "derived"`.
2. A derivation layer separate from the Pi adapter and SQLite persist of events.
3. Deterministic extraction first (workspace already observed; files/commands only as evidence references).
4. Semantic claims only with explicit source event ids. Unsupported claims are dropped, not guessed.
5. `harnie show` may print derived sections when present. It must still print observed events/diagnostics.
6. Tests: Fixture C yields a decision with evidence; Trace B does not invent a completed-work finding; no claim without provenance.

## Explicit freezes

No OpenCode handoff, native resume, cloud, UI, MCP, model-assisted derivation unless a local/explicit derivation path is already in the repo. Prefer rules + evidence constraints over a new provider integration unless required.

## Sprint north star

Say what the work means only when you can show why.
