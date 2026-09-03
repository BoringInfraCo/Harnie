# Sprint 011 run notes — live OpenCode continuation (Fixture C)

Evidence cutoff: 2026-09-02.  
Evaluation capture only. No Harnie product (`src/`) change. `/tmp` was not committed.

## Result

**No continuation.** OpenCode started a session against the isolated workspace, selected `build · claude-sonnet-4-6`, and exited before any agent tool use. Anthropic rejected the call: credit balance too low.

This is not a score of whether a Harnie handoff reduces re-investigation. IMPLEMENTATION.md step 20 behavior was not observed.

## Isolation

Disposable workspace: `/tmp/harnie-sprint-011-c`  
Isolated XDG: `/tmp/harnie-sprint-011-xdg/{data,config,state,cache}`  
Auth: copy of `~/.local/share/opencode/auth.json` into `$XDG_DATA_HOME/opencode/auth.json`, mode 0600 (contents not printed).

Binary: `/Users/sergio/.opencode/bin/opencode` **1.18.26**

Workspace HEAD: `b845a8a` (`Fixture C after reported xhigh 5.3 edits`). Files already contained the reported 5.2+5.3 xhigh edits. Handoff copied from `docs/research/sprint-010/fixture-c-handoff.md` (1177 bytes) to `/tmp/harnie-sprint-011-c/HANDOFF.md` and `docs/research/sprint-011/fixture-c-handoff.md`.

Production `~/.local/share/opencode/opencode.db` mtime stayed **2026-09-01 23:54:03** (595320832 bytes). Isolated DB: `/tmp/harnie-sprint-011-xdg/data/opencode/opencode.db` (249856 bytes, created 2026-09-02 10:36:55).

## Attempt 1 — specified argv (no session)

Exact flags from the sprint instruction. `-f` is a yargs array, so the prompt was consumed as another file:

```bash
opencode run --pure --dir /tmp/harnie-sprint-011-c --format default \
  --title "harnie-sprint-011-fixture-c" \
  --auto \
  -f /tmp/harnie-sprint-011-c/HANDOFF.md \
  "Continue the work."
```

| Field | Value |
|---|---|
| Start | 2026-09-02T14:36:07Z |
| End | 2026-09-02T14:36:08Z |
| Duration | 1 s |
| Exit code | 1 |
| Model | not selected |
| Stderr | `Error: File not found: Continue the work.` |
| Stdout | empty |

No OpenCode session. Workspace unchanged.

## Attempt 2 — live `run` (captured stdout/stderr)

Same flags, with `--` so `-f` does not eat the message. Prompt text was still only `Continue the work.` No Pi summary. No `-m`.

```bash
opencode run --pure --dir /tmp/harnie-sprint-011-c --format default \
  --title "harnie-sprint-011-fixture-c" \
  --auto \
  -f /tmp/harnie-sprint-011-c/HANDOFF.md \
  -- \
  "Continue the work."
```

XDG env as above.

| Field | Value |
|---|---|
| Start | 2026-09-02T14:36:55Z |
| End | 2026-09-02T14:36:57Z |
| Duration | 2 s |
| Exit code | 1 |
| Model | `build · claude-sonnet-4-6` (stderr banner) |
| Session | `ses_f9d72ce6affenSra4Fl7y5o4zO` (isolated log; title `harnie-sprint-011-fixture-c`) |
| Stdout | empty (0 bytes) — `docs/research/sprint-011/opencode-run-stdout.txt` |
| Stderr | 180 bytes — `docs/research/sprint-011/opencode-run-stderr.txt` |

Stderr (ANSI stripped):

```text
> build · claude-sonnet-4-6

Error: Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.
```

Isolated log: session created, `HANDOFF.md` attached (`touching file`), loop step 0, then process exit. Cost 0, tokens 0. No tool names after attach. Did not retry with MiniMax / OpenCode Go (no `-m`; billing failure recorded as-is). No second “fresh” session.

## Workspace after the run

`git status` in `/tmp/harnie-sprint-011-c`:

```text
On branch main
Untracked files:
	HANDOFF.md

nothing added to commit but untracked files present
```

`git diff`: empty.

`HANDOFF.md` was untracked before attempt 2 (copied in, not part of the fixture commit). It is not an OpenCode edit.

### `packages/ai/src/models.ts`

Unchanged. Still:

```ts
export function supportsXhigh(model) {
  return model.id.includes("model-5.2") || model.id.includes("model-5.3");
}
```

### `packages/agent/src/types.ts`

Unchanged. Still:

```ts
/** xhigh is supported by model-5.2 and model-5.3 variants. */
export type ThinkingLevel = "off" | "high" | "xhigh";
```

## Did OpenCode continue?

| Question | Answer |
|---|---|
| Re-applied the 5.3 edits? | **No.** Files already had them; no diff. |
| Wrote tests? | **No.** No new files besides pre-existing untracked `HANDOFF.md`. |
| Inspected the repo? | **No.** Failed before tool use. |
| Hung on permissions? | **No.** `--auto`; exit was billing, not a permission prompt. |

## Captured files

- `docs/research/sprint-011/fixture-c-handoff.md`
- `docs/research/sprint-011/opencode-run-stdout.txt` (attempt 2, empty)
- `docs/research/sprint-011/opencode-run-stderr.txt` (attempt 2, credit error)
- `docs/research/sprint-011/run-notes.md` (this file)

No continuation transcript exists for attempts 1–2. None is invented here.

## Attempt 3 — free OpenCode model (parent retry)

Anthropic failed on credits. Retry used isolated XDG and the same sandbox, with `-m opencode/mimo-v2.5-free` and `--` so `-f` does not eat the prompt.

```bash
opencode run --pure --dir /tmp/harnie-sprint-011-c --format default \
  --title "harnie-sprint-011-fixture-c-free" \
  --auto \
  -m opencode/mimo-v2.5-free \
  -f /tmp/harnie-sprint-011-c/HANDOFF.md \
  -- \
  "Continue the work."
```

| Field | Value |
|---|---|
| Start | 2026-09-02T14:39:35Z |
| End | 2026-09-02T14:46:05Z |
| Duration | ~6.5 min |
| Exit code | 0 |
| Model | `build · mimo-v2.5-free` |
| Stdout | `docs/research/sprint-011/opencode-run-retry-stdout.txt` (458 bytes) |
| Stderr | `docs/research/sprint-011/opencode-run-retry-stderr.txt` |

Tools: Read `models.ts`, Read `types.ts`, Grep `xhigh`, Read `README.md`, Grep `model-5.[23]`, Grep `supportsXhigh`.

`git diff` still empty. OpenCode did not re-apply edits or add tests. Score: `docs/research/sprint-011/applied-score.md` (**PASS**).
