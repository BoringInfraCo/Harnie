# Harnie

AI coding work should outlive the agent that performed it.

Harnie is a local-first work-state layer for coding agents. It reads Pi, OpenCode, and Codex sessions without mutating them, stores observed work in SQLite, and emits continuation handoffs.

**One-sentence pitch:**
Harnie local-first records and preserves agent work transcripts (Pi/OpenCode/Codex sessions) into SQLite, enabling continuation handoffs across tools—offline, without mutating source sessions.

**For engineers:**
Harnie captures the agent-work handoff graph (sessions → observed work → continuation targets) into a local SQLite DB at `$HARNIE_HOME/harnie.db`. Run `harnie init` + `harnie import pi <session.jsonl>` to build a normalized work archive. All data stays on your machine; core functionality requires no internet. Think of it as "git log" for agent work states—preserving what was accomplished so it can be restored or handed off later.

**For technical product folks:**
A local-first work-preservation layer for AI development. Records agent session transcripts (Pi JSONL, OpenCode, Codex) into SQLite so teams can audit, version, and reason about completed work—without sending data externally. Enables continuation handoffs (e.g., "handoff this work to OpenCode") while keeping source sessions immutable. Phase 0 (Pi→Work→OpenCode) is complete; Phase 2 adds import/handoff tooling.
