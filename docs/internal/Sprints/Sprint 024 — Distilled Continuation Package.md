# Sprint 024 — Distilled Continuation Package
**Status:** Complete — GO
**Phase:** 4 — Context Reconstruction
**Type:** Implementation
**Depends on:** Sprint 023 — GO

## Objective

Turn the observed context package into a continuation brief: unresolved
work, next steps that are not just pending-tool leftovers, capped
findings, and short evidence citations — still without dumping
transcripts.

```text
Work.goal + operations + derived claims
        ↓
distillContinuation (in extractObservedContext)
        ↓
Handoff / show  (unresolved, next, capped findings, evidence)
```

## Sprint question

Can Fixture C tell a receiver to **verify, not re-edit**, and can Trace B
keep the pending `.git/config` read **and** the still-open “propose a
plan” task — with claim evidence cited, findings capped, and the
handoff still under half the source JSONL?

## Scope

1. Extend `src/work/context.ts` (no new module tree, no persist):
   - `unresolved?: string` — pending tool, or “Verification not recorded”
     when succeeded edits exist and no test state.
   - `continuation: readonly string[]` — distilled next steps.
   - `evidence: readonly string[]` — unique event ids from those
     distilled claims (and revision’s git operation when present).
2. Continuation rules (deterministic, no model):
   - Keep derived `missing-tool-result` next steps when present;
     otherwise synthesize the same pending-op line from operations.
   - If succeeded changed files exist, no pending ops, and no test
     state: append `Verify the edits on <paths>. Do not re-edit.`
     Evidence = those edit operations.
   - If pending ops exist and the goal matches `propose a …` (Trace B):
     append that clause (`Propose a refactoring plan after pending tool
     activity.`). Evidence = goal evidence. Do not copy the whole goal.
   - Do **not** change `derive.ts` goal / decision / finding / next-step
     rules. Distillation is a handoff/show projection.
3. `buildHandoffFromWork`:
   - `nextSteps` = `continuation` when non-empty, else derived next
     steps (so Trace B still has ≥1 next step).
   - `unresolved` / `evidence` spread when present.
   - Cap `findings` to the last **5** statements (chronological). Store
     findings stay uncapped.
   - `currentState`: pending ops still win as Unresolved/pending;
     succeeded edits still produce `Edits reported success … Verification
     not recorded` **even if** continuation next steps exist (Fixture C
     must not lose “edits succeeded”).
4. Renderers (opencode / pi / codex, lockstep): non-empty `## Unresolved`
   and `## Evidence` (`- <id>`). Next steps already exist. Do not repeat
   Unresolved if it is a substring of Current state.
5. `harnie show`: `Next` comes from `handoff.nextSteps` (aligned with
   handoff). Print Unresolved / Evidence with the other context block
   after Operations, before Checkpoints.
6. Tests:
   - Fixture C: nextSteps match `/verify/i` and `/do not re-edit/i`;
     currentState still matches `/success/i` and `models.ts`; not
     `/re-?do the edits/`.
   - Trace B: nextSteps still include pending `.git/config`; also match
     `/refactoring plan|propose a/i`; must not claim investigation
     complete; revision `47da672` unchanged.
   - Evidence: Fixture C verify step and Trace B pending/plan cite at
     least one event id present on `handoff.evidence`.
   - Findings cap: synthetic Work with 8 findings → handoff has 5, the
     last five statements.
   - Compactness: JSON and OpenCode markdown `< 50%` of Fixture C and
     Trace B JSONL (existing tests stay, must still pass).

## Freeze

No `--checkpoint`. No `contexts` table / workspace columns. No live git.
No file bodies. No model-assisted derivation. No derive.ts rule changes.
No new CLI command. No Phase 6 export. No native resume.

## Evaluation

`npx tsc --noEmit`: clean. `npx vitest run`: 38 files, 182 tests pass
(38/175 at Sprint 023 + 7 tests). Fixture C next steps say verify and do
not re-edit while current state still reports succeeded edits. Trace B
keeps pending `.git/config` and adds propose-a-refactoring-plan after
pending tool activity. Distilled claims populate `evidence` event ids.
Handoff findings are the last 5. JSON and OpenCode markdown stay under
half of each fixture JSONL. `derive.ts` unchanged. No schema, no live
git, no `--checkpoint`.

## North star

The next harness knows what is still open and what not to redo, and can
trace those claims to events — without a transcript.
