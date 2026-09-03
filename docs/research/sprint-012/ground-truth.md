# Sprint 012 ground truth (fill after session chosen)

Filled 2026-09-02 from the live Pi session, independently of OpenCode.

| Fact | Value |
|---|---|
| Session | `/tmp/harnie-sprint-012-pi-sessions/2026-09-02T23-28-43-371Z_01a06474-116b-7673-b44f-f25bdf145ef7.jsonl` |
| Work id | `work:pi:01a06474-116b-7673-b44f-f25bdf145ef7` |
| Workspace | `/private/tmp/harnie-sprint-012-repo` (eval clone of the Harnie working tree) |
| Goal | Add optional `--json` on `harnie handoff` to write the Handoff object as JSON next to the markdown |
| Files read | `src/cli/handoff.ts`, `src/work/handoff.ts`, `src/handoff/opencode.ts` (each read twice; tool results succeeded) |
| Completed work | Investigation reads only. **No `--json` implementation.** Clone `git diff` empty after Pi. |
| Decision | None reliable. Nova-micro “I will …” sentences are confused (claimed files unread despite successful reads). |
| Unresolved | Implement `--json`; tests/docs not started |
| Correct next work | Implement the flag in `src/cli/handoff.ts` using existing write path; do not treat files as unread |
| Wrong next work | Re-investigate as if the three files were never read; abandon the flag |

Pi model: `openrouter` / `amazon/nova-micro-v1`. Session ended with an assistant wrap-up that incorrectly said files were inaccessible. Tool operations show the reads succeeded. Work remains unfinished.

Raw JSONL is **not** committed (private/local session). Handoff markdown is in `docs/research/sprint-012/handoff.md`.
