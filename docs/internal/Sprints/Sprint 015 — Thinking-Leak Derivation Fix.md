# Sprint 015 — Thinking-Leak Derivation Fix
**Status:** Complete — GO
**Phase:** 1 — Local Work State
**Type:** Implementation
**Depends on:** Sprint 012 package hole (documented, not patched)

## Objective

Stop deriving Decisions and Findings from assistant thinking.

```text
Observed Work
        ↓
deriveObservedWork (visible assistant text only)
        ↓
handoff Decisions / Findings
```

Thinking is not a decision. Operations stay the source of what actually happened.

## Evidence

Sprint 012 live Pi session (`amazon/nova-micro-v1`): six successful reads of `handoff.ts` files. Derivation still lifted `<thinking>…I'll…I will…cannot read files…</thinking>` into Decisions/Findings, contradicting operations. OpenCode ignored the leak; a more literal consumer may not.

Pi stores thinking as `{type:"thinking", thinking}` blocks **and** some models dump chain-of-thought as `type:"text"` wrapped in `<thinking>` tags. OpenCode `reasoning` parts are already `unknown` without copied text.

## Scope

1. `extractText` used by derive must ignore `type: "thinking"` / `type: "reasoning"` blocks.
2. Strip `<thinking>…</thinking>` (including unclosed open tags) from remaining text before sentence split.
3. Visible `type: "text"` still yields Fixture C’s “I will” decision.
4. Trace B stays unresolved; no invented completion.

## Freeze

No new event kinds. No model-assisted derivation. No Pi JSONL writes. No OpenCode DB mutation. Do not drop thinking from the observed event payload (Sprint 002: if preserved, keep it distinguishable). This sprint only changes what derive *reads*.

## Sprint question

Can Harnie keep provenance-backed Decisions/Findings without promoting chain-of-thought into Work meaning?
