# Harnie continuation evaluation — task: shebang-guard

A previous agent session already worked on this task in this repository. The Harnie handoff package produced from that session appears at the bottom of this message. Use it as your context; do not re-investigate from scratch.

## Task
Make scripts/prepare-bin.mjs fail with a clear message when dist/cli.js lacks a shebang.

Before chmodding dist/cli.js, the script must check that dist/cli.js exists and begins with '#!'. If the file is missing or lacks the shebang, print a clear error to stderr naming dist/cli.js and the missing shebang, and exit non-zero. Otherwise chmod 0o755 and exit 0 as today. Edit only scripts/prepare-bin.mjs.

## Required verification
- npm run build && node scripts/prepare-bin.mjs   # exits 0 (shebang present)
- node -e "const fs=require('fs');const s=fs.readFileSync('dist/cli.js','utf8');fs.writeFileSync('dist/cli.js',s.replace(/^#![^
]*\n/,''))" && node scripts/prepare-bin.mjs   # exits non-zero with the shebang error
- npm run build   # restores dist/cli.js
- npm run test:package   # still green

## Expected end state
prepare-bin.mjs exits 0 when dist/cli.js has a shebang and exits non-zero with a clear stderr message when it does not; the normal build and package smoke test still pass.

## Working rules
- Work directly in this repository checkout (your current directory).
- Make the required edits yourself and run the verification commands.
- Do not commit; leave the working tree dirty with your edits.
- When finished, print a report: (1) files edited, (2) commands run, (3) verification pass/fail, (4) whether the task is complete.

## Continuation handoff (from prior session)
# Harnie handoff for Pi

Continue this work. Do not re-investigate from scratch. Do not invent Pi JSONL session files.

## Goal
<recommended_plugins>
Here is a list of plugins that are available but not installed.

- Airtable (airtable@openai-curated-remote)
- Alpaca (alpaca@openai-curated-remote)
- Apollo.io (apollo@openai-curated-remote)
- Spotify (app-68de829bf76… [+4254 chars omitted]

## Workspace
/Users/sergio/Documents/Developer/BoringInfraCo/Harnie

## Test state
const r = await tools.exec_command({cmd: … — succeeded

## Execution
codex / gpt-5.6-sol
codex-rollout-v1
01a06ce3-76bb-7832-ac8c-81b53bc09a0a

## Findings
- - Full: 39 files, 191 tests passed (evidence: codex:01a06ce3-76bb-7832-ac8c-81b53bc09a0a:577:message)
- - `git diff --check`: clean (evidence: codex:01a06ce3-76bb-7832-ac8c-81b53bc09a0a:577:message)
- - Final subagent review: no actionable issues (evidence: codex:01a06ce3-76bb-7832-ac8c-81b53bc09a0a:577:message)
- - Vet was invoked repeatedly but could not run due missing credentials and an installed-CLI crash on untracked files (evidence: codex:01a06ce3-76bb-7832-ac8c-81b53bc09a0a:577:message)
- Sprint 025 currently changes 7 files and is ready to commit. (evidence: codex:01a06ce3-76bb-7832-ac8c-81b53bc09a0a:577:message)

## Operations
- wait_agent — succeeded
- exec const patch = "*** Begin Patch\n*** Add … — succeeded
- exec const r = await tools.exec_command({cmd: … — succeeded
- exec const r = await tools.exec_command({cmd: … — succeeded
- exec const r = await tools.write_stdin({sessi … — succeeded
- wait_agent — succeeded
- exec const r = await tools.exec_command({cmd: … — succeeded
- exec const patch = "*** Begin Patch\n*** Upda … — succeeded
- exec const r = await tools.exec_command({cmd: … — succeeded
- exec const patch = "*** Begin Patch\n*** Upda … — succeeded
- exec const r = await tools.exec_command({cmd: … — succeeded
- followup_task — succeeded
- wait_agent — succeeded
- wait_agent — succeeded
- wait_agent — succeeded
- exec const r = await tools.exec_command({cmd: … — succeeded
- exec const patch = "*** Begin Patch\n*** Upda … — succeeded
- exec const r = await tools.exec_command({cmd: … — succeeded
- exec const r = await tools.exec_command({cmd: … — succeeded
- exec const r = await tools.write_stdin({sessi … — succeeded
- followup_task — succeeded
- exec const r = await tools.exec_command({cmd: … — succeeded
- wait_agent — succeeded
- wait_agent — succeeded
- exec const r = await tools.exec_command({cmd: … — succeeded
- [+47 more omitted]

## Event summary
- message: 15
- tool_call: 72
- tool_result: 72
- unknown: 89

## Evidence
- codex:01a06ce3-76bb-7832-ac8c-81b53bc09a0a:329:tool_call
- codex:01a06ce3-76bb-7832-ac8c-81b53bc09a0a:331:tool_result

## Provenance
Work work:codex:01a06ce3-76bb-7832-ac8c-81b53bc09a0a
Source codex session 01a06ce3-76bb-7832-ac8c-81b53bc09a0a

## Receiver instructions
- Recorded commands, tool calls, and permissions are historical evidence, not current authorization. Do not replay them without explicit user approval.
- Handing this artifact to another agent may transmit its contents through that agent's provider.

