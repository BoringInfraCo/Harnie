# Sprint 012 run notes

Evidence cutoff: 2026-09-02. No Harnie `src/` change. Raw Pi JSONL not committed.

## Pi session

Created in eval clone `/tmp/harnie-sprint-012-repo` (copy of the Harnie working tree, not Fixture C).

- Binary: `pi` 0.84.4
- Model: `openrouter` / `amazon/nova-micro-v1` (default `kimi-k2.6` hit OpenRouter 402 / max_tokens)
- `--session-dir /tmp/harnie-sprint-012-pi-sessions`
- Session file: `2026-09-02T23-28-43-371Z_01a06474-116b-7673-b44f-f25bdf145ef7.jsonl`
- Six successful `read`s of the three handoff sources. No edits. Assistant wrap-up incorrectly claimed files unread.
- Clone `git diff` empty after Pi.

Kimi-k2.6 402 is a billing limit, not a Harnie hole. Do not paste OpenRouter error bodies (they can contain key URLs).

## Harnie import / handoff

Temp `HARNIE_HOME=/tmp/harnie-sprint-012-harnie` (not `~/.harnie`).

```text
harnie init
harnie import pi <session.jsonl>
harnie show work:pi:01a06474-116b-7673-b44f-f25bdf145ef7
harnie handoff work:pi:01a06474-116b-7673-b44f-f25bdf145ef7 --to opencode
```

Work id: `work:pi:01a06474-116b-7673-b44f-f25bdf145ef7`  
Artifacts: `import.txt`, `show.txt`, `handoff.md`

## OpenCode

Isolated XDG under `/tmp/harnie-sprint-012-xdg`. Auth copied, not printed. Production `opencode.db` mtime unchanged (`1788321243`). `--auto` only because `$WORKSPACE` is a dedicated clone. `--` before the prompt.

```bash
opencode run --pure --dir /tmp/harnie-sprint-012-repo --format default \
  --title "harnie-sprint-012-real-repo" --auto \
  -m opencode/mimo-v2.5-free \
  -f /tmp/harnie-sprint-012-repo/HANDOFF.md \
  -- "Continue the work."
```

Exit 0 in ~40s. Tools: read three handoff files, edit `src/cli/handoff.ts` (`--json`). Score: **PASS**.
