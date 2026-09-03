# Sprint 016 run notes

Evidence cutoff: 2026-09-02. No Harnie `src/` change. Raw OpenCode DB, snapshot, and Pi JSONL stay in `/tmp`.

## Isolation

- Eval clone: `/tmp/harnie-sprint-016-repo`
- OpenCode XDG: `/tmp/harnie-sprint-016-xdg` (auth copied, mode 0600, not printed)
- `HARNIE_HOME=/tmp/harnie-sprint-016-harnie`
- Pi `--session-dir /tmp/harnie-sprint-016-pi-sessions`
- Production `opencode.db` mtime **unchanged** (`1788406866`)
- Production `~/.pi/agent/sessions` count **2**, Harnie-project jsonl mtime unchanged

## OpenCode prefix

```bash
opencode run --pure --dir /tmp/harnie-sprint-016-repo --auto \
  -m opencode/mimo-v2.5-free --title "harnie-sprint-016-opencode-prefix" \
  -- "Investigate how harnie handoff works… first code change. Do not finish tests or documentation."
```

Exit 0 ~52s. Session `ses_f9aa2dee0ffexWp97EGu26BCZ3`. Edited `src/cli/handoff.ts` (`--json` sidecar). Ran existing `tests/cli-handoff.test.ts` (7/7). Tests/docs for `--json` not added.

## Harnie

```text
harnie import opencode <snapshot from isolated sqlite, read-only>
harnie handoff work:opencode:ses_f9aa2dee0ffexWp97EGu26BCZ3 --to pi
```

Work `work:opencode:ses_f9aa2dee0ffexWp97EGu26BCZ3`. File `$HARNIE_HOME/handoffs/work_opencode_ses_f9aa2dee0ffexWp97EGu26BCZ3.pi.md`. No JSONL written.

## Pi continuation

Prompt besides `@HANDOFF.pi.md`: only `Continue the work.`

| Attempt | Model | Result |
|---|---|---|
| 1 | `google/gemma-4-31b-it:free` | **429** upstream rate limit. No tools. Not a Harnie hole. |
| 2 | `amazon/nova-micro-v1` (sandbox on) | Exit 0. Tools ran; bash `npx`/`npm` not on sandbox PATH. No file edits. |
| 3 | `amazon/nova-2-lite-v1` | **402** max_tokens vs remaining credits. Not a Harnie hole. |
| 4 | `amazon/nova-micro-v1` `--no-sandbox` | **scored**. Exit 0 ~116s. |

Attempt 4:

```bash
pi -p --session-dir /tmp/harnie-sprint-016-pi-sessions \
  --provider openrouter --model amazon/nova-micro-v1 \
  --thinking off --no-context-files --no-sandbox \
  @HANDOFF.pi.md -- "Continue the work."
```

`--no-sandbox` only because `$WORKSPACE` is a dedicated clone (bash needed `npx` on PATH). Tools: `git status`, `git add src/cli/handoff.ts`, `git commit` (existing OpenCode diff), `tsc --noEmit`, full `vitest run`. No `edit`/`write` of `handoff.ts`.

Do not paste OpenRouter error bodies (they can contain key URLs).
