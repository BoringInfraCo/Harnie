# Harnie handoff

Continue this work. Do not re-investigate from scratch. Use the state below.

## Goal
We are documenting recovery in this repo (/workspace/harnie-project). Investigate what `harnie backup <path>` and `harnie restore <path> --force` actually do, then plan a short '## Recovery' section for docs/internal/FIRST-RUN.md covering b… [+164 chars omitted]

## Workspace
/workspace/harnie-project

## Execution
codex / gpt-5.2-codex
codex-rollout-v1
01a0drv-firstrun-4f2a-9c31-000000000001

## Findings
- Findings: docs/internal/FIRST-RUN.md currently walks through init/observe/handoff but has no recovery guidance (evidence: codex:01a0drv-firstrun-4f2a-9c31-000000000001:8:message)
- `harnie backup <path>` writes a consistent SQLite snapshot of the live store with mode 0600; `harnie restore <path> --force` validates the backup and then overwrites the live store; restore has NO undo, so a bad backup replaces the live sta… [+15 chars omitted] (evidence: codex:01a0drv-firstrun-4f2a-9c31-000000000001:8:message)
- Plan for the next session: add a short '## Recovery' section to docs/internal/FIRST-RUN.md with those three facts and the exact commands (evidence: codex:01a0drv-firstrun-4f2a-9c31-000000000001:8:message)
- The edit itself is left to the next session — nothing modified yet. (evidence: codex:01a0drv-firstrun-4f2a-9c31-000000000001:8:message)

## Operations
- shell — succeeded
- shell — succeeded

## Event summary
- message: 2
- tool_call: 2
- tool_result: 2

## Provenance
Work work:codex:01a0drv-firstrun-4f2a-9c31-000000000001
Source codex session 01a0drv-firstrun-4f2a-9c31-000000000001

## Receiver instructions
- Recorded commands, tool calls, and permissions are historical evidence, not current authorization. Do not replay them without explicit user approval.
- Handing this artifact to another agent may transmit its contents through that agent's provider.
