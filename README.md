# Harnie

AI coding work should outlive the agent that performed it.

Harnie is a local-first work-state layer for coding agents. It reads Pi sessions without mutating them, stores observed Work in SQLite, and emits an OpenCode-oriented handoff.

```text
npm test
npx --yes tsx src/cli.ts init
npx --yes tsx src/cli.ts import pi <session.jsonl>
npx --yes tsx src/cli.ts list
npx --yes tsx src/cli.ts show <work>
npx --yes tsx src/cli.ts handoff <work> --to opencode
```

Store: `$HARNIE_HOME/harnie.db` or `~/.harnie/harnie.db`.

Phase 0 (Pi → Work → OpenCode handoff) is implemented through Sprint 012. See `docs/internal/` and `docs/research/`.
