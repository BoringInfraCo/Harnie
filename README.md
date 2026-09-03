# Harnie

AI coding work should outlive the agent that performed it.

Harnie is a local-first work-state layer for coding agents. It reads Pi and OpenCode sessions without mutating them, stores observed Work in SQLite, and emits continuation handoffs.

```text
npm test
npx --yes tsx src/cli.ts init
npx --yes tsx src/cli.ts import pi <session.jsonl>
npx --yes tsx src/cli.ts import opencode <snapshot.json>
npx --yes tsx src/cli.ts list
npx --yes tsx src/cli.ts show <work>
npx --yes tsx src/cli.ts handoff <work> --to opencode
npx --yes tsx src/cli.ts handoff <work> --to pi
```

Store: `$HARNIE_HOME/harnie.db` or `~/.harnie/harnie.db`. Handoffs: `$HARNIE_HOME/handoffs/<work>.md` (OpenCode) and `$HARNIE_HOME/handoffs/<work>.pi.md` (Pi). Markdown from Work — not Pi JSONL, not OpenCode SQLite.

Phase 0 (Pi → Work → OpenCode) is through Sprint 012. Phase 2 bidirectional (`import opencode`, `handoff --to pi`) is through Sprint 014. See `docs/internal/` and `docs/research/`.
