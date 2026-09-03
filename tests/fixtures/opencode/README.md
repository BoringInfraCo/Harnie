# OpenCode research fixtures

Sanitized snapshot of the Sprint 012 isolated-XDG OpenCode session, not a production chat.

`sprint-012-handoff.json` is parser evidence for `opencode-session-v1` (`session` / `message` / `part`). Paths are rewritten from `/private/tmp/harnie-sprint-012-repo` to `/workspace/harnie-project`. User and assistant text, reasoning, tool outputs, and patch diffs were dropped or replaced with placeholders. Original ids are retained.

The original SQLite database is not committed.

`readOpenCodeSnapshotFile` / `readOpenCodeSnapshotText` are the supported test path. Optional `readOpenCodeSqliteFile(dbPath, sessionId)` reads the same tables from an OpenCode DB in read-only mode when the file exists.
