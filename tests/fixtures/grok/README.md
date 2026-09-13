# Grok research fixtures

Invented Grok Build session directory (`chat_history.jsonl` transcript plus
`summary.json` sidecar) for `grok-chat-v1`. Paths are
`/workspace/grok-project`. Not a production `~/.grok` chat.

`unfinished-demo/` is a short unfinished session: user asks to build a demo
video catalog; one successful `read_file`; one failed `run_terminal_command`
(`Error:` output); one unmatched `search_replace` call (pending operation);
a typed `reasoning` item that must not become a decision; a
`backend_tool_call` telemetry entry; an environment-injection user entry
without `<user_query>` that must not become the goal; and a `system` entry
that is skipped entirely.
