# Sprint 008 — OpenCode Continuation Evaluation
**Status:** Complete — Conditional GO
**Phase:** 0 — Feasibility
**Type:** Evaluation / dogfood
**Depends on:** Sprint 007 — GO (implementation)

## Objective

Prove or refute Harnie's thesis with a real unfinished coding task:

```text
Pi → Harnie Work State → OpenCode handoff → continuation
```

versus a fresh OpenCode session with no Harnie context.

## Sprint question

Does OpenCode meaningfully continue the Pi work with substantially less developer re-explanation than starting over?

## Scope

Follow IMPLEMENTATION.md steps 19–20. Capture the handoff artifact, the OpenCode session, and a written score. Do not expand the product to hide a failed handoff.

## Decision criteria

**GO** if OpenCode identifies goal, completed work, important files, decisions, unresolved problem, and a sensible next step, and does not mostly re-investigate.

**NO-GO** if the developer still has to explain the task, or the handoff is effectively a reformatted transcript.

## Sprint north star

If OpenCode can continue because Harnie knew what happened, Harnie has earned the right to become a product.
