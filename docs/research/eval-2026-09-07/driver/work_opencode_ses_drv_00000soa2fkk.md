# Harnie handoff

Continue this work. Do not re-investigate from scratch. Use the state below.

## Goal
Document backup/restore recovery in the first-run walkthrough.

## Workspace
/workspace/harnie-clone

## Relevant files
- docs/internal/FIRST-RUN.md

## Read yields
- docs/internal/FIRST-RUN.md — completed

## Execution
opencode / anthropic / claude-sonnet-4-6
opencode-session-v1
ses_drv_00000soa2fkk

## Decisions
- I will append a '## Recovery' section to docs/internal/FIRST-RUN.md covering: harnie backup <path> writes a consistent SQLite snapshot with 0600 permissions, harnie restore <path> --force validates the backup and then overwrites the live st… [+29 chars omitted] (evidence: opencode:ses_drv_00000soa2fkk:prt_000010wq51bf:message)

## Findings
- Confirmed from the source: backup produces a consistent snapshot file; restore validates the backup before overwriting; there is no undo of a restore, so the section must warn users to keep backups (evidence: opencode:ses_drv_00000soa2fkk:prt_000012jrk83l:message)
- Docs-only change; no code edits. (evidence: opencode:ses_drv_00000soa2fkk:prt_000012jrk83l:message)

## Operations
- read docs/internal/FIRST-RUN.md — succeeded
- bash grep -n 'backup\|restore' src/cli.ts — succeeded

## Event summary
- message: 4
- tool_call: 2
- tool_result: 2

## Provenance
Work work:opencode:ses_drv_00000soa2fkk
Source opencode session ses_drv_00000soa2fkk

## Receiver instructions
- Recorded commands, tool calls, and permissions are historical evidence, not current authorization. Do not replay them without explicit user approval.
- Handing this artifact to another agent may transmit its contents through that agent's provider.
