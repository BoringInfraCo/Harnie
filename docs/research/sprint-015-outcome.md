# Sprint 015 Outcome — Thinking-Leak Derivation Fix

Status: **GO**  
Evidence cutoff: 2026-09-02

## Sprint question

Can Harnie keep provenance-backed Decisions/Findings without promoting chain-of-thought into Work meaning?

Answer: **yes**. Derive reads visible assistant text only.

## What changed

`src/work/derive.ts` `extractText`:

- Skips content blocks with `type` `thinking` or `reasoning`.
- Strips well-formed `<thinking>…</thinking>` from remaining text, then unclosed `<thinking>…` through end of string.

Observed event payloads are unchanged (Sprint 002: thinking stays distinguishable if preserved). OpenCode `reasoning` parts were already `unknown` without copied text.

## Tests

116 passing, including three new cases in `tests/derive.test.ts`:

- Typed `{type:"thinking"}` “I will secretly rewrite…” is not a decision.
- XML `<thinking>` “files were not read” / “I'll need to read” does not become a decision or finding; visible “I will update that predicate” still does.
- Unclosed `<thinking>I will invent a completion report` does not leak.

Fixture C still derives the visible I-will. Trace B stays unresolved.

`npx tsc --noEmit` clean.

## Not this sprint

Assistant **visible** wrap-up that contradicts operations (a model saying files unread after successful reads, outside thinking tags) is still derived as findings. That is a later operations-vs-claims problem, not thinking-leak.

Live `--to pi` dogfood is still next for Phase 2 validation.
