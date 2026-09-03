# Sprint 006 Outcome — Provenance-Backed Semantic Derivation

Status: **GO**  
Evidence cutoff: 2026-09-01

## Sprint question

> Can Harnie state what the work means, with every claim pointing at source events, and refuse to persist unsupported claims?

Answer: yes, with conservative rules and no model. Every derived claim has `observation: "derived"` and at least one Work event id as evidence. Empty-evidence claims are dropped.

## Rules

| Claim | Rule | Source |
|---|---|---|
| Goal | `first-user-message` | First non-empty user message text |
| Decision | `assistant-i-will` | Assistant sentences matching `I will` / `I'll` |
| Finding | `assistant-after-tools` | Other assistant sentences after a `tool_result` |
| Next step | `missing-tool-result` | Pending `tool_call` with `missing_tool_result` |

Events stay `observed`. Derivation does not rewrite event provenance.

## Evidence

**Fixture C** (`stateful-prefix.jsonl`): goal includes extending xhigh to 5.3; decision includes “I will update that predicate…”.

**Trace B**: goal from the investigate prompt; next step `Complete pending tool call read`; no invented “investigation complete” finding.

## What shipped

- `src/work/derive.ts` — `deriveObservedWork`
- Work fields: `goal`, `decisions`, `findings`, `nextSteps`
- SQLite: `goal_json`, tables `decisions`, `findings`, `next_steps`
- Import pipeline: observe → derive → persist
- `harnie show` prints Goal / Decisions / Findings / Next only when present

No LLM. No OpenCode handoff.

## Tests

68 passing across 15 files. New: `tests/derive.test.ts`, `tests/derive-persist.test.ts`, `tests/cli-show-derived.test.ts`.

## Bounds

- Rules are brittle (only `I will` / `I'll` for decisions).
- Findings are assistant sentences after tools, not a quality filter.
- No model-assisted derivation.

These are later-sprint inputs, not NO-GO.

## Decision

**GO.**

## Sprint 007 recommendation

Build the OpenCode-oriented handoff from persisted Work State (observed + derived), not from Pi JSONL. `harnie handoff <work> --to opencode` should emit a compact package: goal, current state, workspace, decisions, findings, next steps, provenance. Still no native OpenCode session injection unless a safe supported input path is documented first.
