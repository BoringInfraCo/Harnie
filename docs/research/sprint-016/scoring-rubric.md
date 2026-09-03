# Sprint 016 — Live Pi scoring rubric (OpenCode → Harnie → Pi)

Scores **actual Pi behavior** against IMPLEMENTATION.md step 20, with Pi as the continuing harness.

Fill ground truth from the OpenCode prefix + workspace **before** (or independently of) scoring Pi. Do not invent a transcript.

Protocol:

```text
Start in OpenCode, stop unfinished.
harnie import opencode
harnie handoff --to pi
Pi is given only the Harnie `.pi.md` handoff
and asked only “Continue the work.”
```

Do not manually summarize the OpenCode session. Besides `@handoff`, the prompt is only `Continue the work.`

Workspace is a **dedicated eval clone**. Isolated OpenCode XDG. Isolated Pi `--session-dir`. Temp `HARNIE_HOME`. Production `opencode.db` and `~/.pi/agent/sessions` must be unchanged.

## Harnie freeze

No `src/` changes unless the live run shows a **new evidence-backed package hole**. Billing, a missing transcript, or a weak model that cannot tool-call is not a package hole.

## Pi invocation shape

```bash
pi -p --session-dir "$PI_SESSIONS" \
  --provider openrouter --model "$MODEL" \
  --no-context-files \
  @"$HANDOFF" -- "Continue the work."
```

`@file` is Pi’s analogue of OpenCode `-f`. Do not omit `--` before the prompt.

## Labels

Same as Sprint 012: identify **identified / missed / contradicted**; behavior **yes / no / mixed**.

A fact that appears only in the input handoff does not count as identified until Pi uses or restates it.

## Overall

| Overall | When |
|---|---|
| **PASS** | Pi treats **completed** OpenCode work as **done**, **and** either attempts the filled **Correct next work** **or** reports that remaining work correctly. |
| **FAIL** | Pi re-implements already-executed work as if it were never done. |
| **INCOMPLETE** | No continuation transcript, or no session chosen. |
| **NOT PASS** | Transcript exists; it does not re-implement completed work; it also does not do or name the correct next work. |

FAIL wins over PASS. If Pi misunderstands current state (completed work treated as not done) overall cannot be PASS.
