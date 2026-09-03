# Sprint 012 session discovery

Evidence cutoff: 2026-09-02  
Sprint: 012 — Optional Real-Repo Dogfood (Phase 0 feasibility)  
Method: read-only filesystem inspection. Pi was not started. OpenCode was not started. Session JSONL was not copied, rewritten, or imported. Private transcripts were not committed.

## Result in one sentence

**None.** The only local Pi v3 sessions on this machine are the old Trace A sandbox `hello.txt` probe and the Trace B disposable workspace. There is no unfinished Pi coding session whose cwd is the operator’s actual project.

Sprint 012 live continuation therefore has **no candidate**. Do not import, hand off, or score a reconstructed Fixture C / Trace A / Trace B stand-in as if it were a real-repo dogfood.

## Search roots

| Root | Finding |
|---|---|
| `~/.pi/agent/sessions/` | Present. One cwd-encoded bucket, one JSONL file. |
| `PI_CODING_AGENT_DIR` | Unset in the inspection environment. Not exported from `~/.zshrc`, `~/.zprofile`, or `~/.zshenv`. |
| `PI_CODING_AGENT_SESSION_DIR` | Unset. Same shell-config check. |
| `~/.pi/agent/settings.json` | No `sessionDir`. `lastChangelogVersion` is `0.84.4`. |
| Custom `--session-dir` leftovers | One: `/tmp/harnie-traces-workspace/.pi-sessions/` (rejected; see below). |
| Harnie `tests/fixtures/pi/` | Sanitized derivatives only. Rejected. |
| Harnie repo `.pi/` | Absent. |

Default layout matches ground truth: sessions bucketed as `--<encoded-cwd>--/<timestamp>_<session-id>.jsonl`. The single bucket name is `--Users-sergio-Developer-pi-playground--`. Header `cwd` is treated as authoritative.

## Candidates

### 1. Default-store Trace A (sandbox probe) — REJECT

- **Path:** `~/.pi/agent/sessions/--Users-sergio-Developer-pi-playground--/2026-08-29T03-37-13-726Z_01a04b97-c8fe-73e1-8f6d-3dc6b993b64d.jsonl`
- **Header cwd:** `/Users/<user>/Developer/pi-playground`
- **Version:** 3
- **Record count:** 31 (`wc -l`)
- **Header id / timestamp:** `01a04b97-c8fe-73e1-8f6d-3dc6b993b64d` / `2026-08-29T03:37:13.726Z`
- **Last few record types:** `message` (user) → `message` (assistant `toolCall` `bash`) → `message` (`toolResult` `bash`) → `message` (assistant, `stopReason=stop`) → `thinking_level_change`
- **Unfinished?** No. Seven `toolCall` blocks (`write`, `read`, `bash`, `bash`, `bash`, `write`, `bash`) each have a matching `toolResult`. Last assistant turn is a completion, not a pending call.
- **Cwd on disk:** Exists. It is a git work tree with **no commits** on `main`. Tracked content is only untracked `README.md` and `hello.txt`.
- **Reads/edits:** File tools target `hello.txt` (successful `write`/`read`) and `.env` (`write` with `isError: true`). Remaining tools are `bash`. This is the Sprint 002 Trace A sandbox-permission probe, not a repository investigation or source-code edit.

**Reject reason:** sandbox `hello.txt` probe. Sprint 012 needs a real unfinished session in a real project. This session is finished and is not that project.

Byte-identical copy also exists at `/tmp/harnie-traces/trace-a-coding.jsonl` (rejected as `/tmp/harnie-*`; not a second session).

### 2. Trace B disposable workspace — REJECT

Not in the default agent session store. Found only under Harnie capture paths:

| Copy | Path |
|---|---|
| Custom session dir | `/tmp/harnie-traces-workspace/.pi-sessions/2026-09-01T19-42-00-000Z_01a06f01-1234-5678-abcd-ef1234567890.jsonl` |
| Capture copy | `/tmp/harnie-traces/trace-b-unfinished.jsonl` |

- **Header cwd:** `/private/tmp/harnie-traces-workspace`
- **Version:** 3
- **Record count:** 13
- **Last few record types:** `message` (`toolResult` `read`) → `message` (assistant `toolCall` `bash`,`bash`) → `message` (`toolResult` `bash`) → `message` (`toolResult` `bash`) → `message` (assistant `toolCall` `read`)
- **Unfinished?** Yes. Six tool calls, five results. The file ends on an assistant `read` with no following `toolResult`.
- **Cwd on disk:** Exists and is a git repo (`47da672 initial`) containing `README.md`, `analysis.js`, `config.json`. That is still a **disposable Harnie workspace**, not the operator’s actual project.
- **IDs:** Already Harnie-prefixed in the `/tmp` copies (`harnie-call-0006` unmatched). This is capture residue, not a live default-store session.

**Reject reason:** `/tmp/harnie-*` disposable workspace. Same Trace B used as fixture F. Not eligible for Sprint 012 real-repo dogfood.

### 3. Harnie fixtures — REJECT

`tests/fixtures/pi/trace-a-coding.jsonl` (31 records) and `tests/fixtures/pi/trace-b-unfinished.jsonl` (13 records) are sanitized derivatives (`cwd` rewritten to `/workspace/pi-project`). Public fixtures A–D are maintainer-published traces, not local operator sessions.

**Reject reason:** Harnie tests/fixtures.

## Recommendation

**None — do not invent a candidate.**

The only local sessions are:

1. **Trace A** — real default-store v3 file, cwd still on disk as a git tree, but a completed sandbox `hello.txt` probe.
2. **Trace B** — unfinished investigation, but only in a `/tmp/harnie-*` disposable workspace (and already represented by fixture F).

Sprint 012’s question (“does the Fixture C PASS still hold on the operator’s actual project?”) cannot be answered from this store. A later dogfood needs a **new** Pi session: start in a real repository, stop unfinished, then import/handoff. That is out of scope for this discovery note.

No Harnie `src/` change follows from this search. No session file was mutated. No private JSONL was copied into the repo.
