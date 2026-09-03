# Sprint 016 ground truth (fill after OpenCode prefix)

Filled 2026-09-02 from the isolated OpenCode prefix and clone, independently of Pi.

| Fact | Value |
|---|---|
| Session | `ses_f9aa2dee0ffexWp97EGu26BCZ3` (isolated XDG) |
| Work id | `work:opencode:ses_f9aa2dee0ffexWp97EGu26BCZ3` |
| Workspace | `/private/tmp/harnie-sprint-016-repo` (eval clone) |
| Goal | Add optional `--json` on `harnie handoff` to write the Handoff object as JSON next to the markdown. Do not finish tests or documentation. |
| Files | `src/cli/handoff.ts` (edited), plus reads of `src/work/handoff.ts`, `src/handoff/opencode.ts`, `src/handoff/pi.ts`, `tests/cli-handoff.test.ts` |
| Completed work | `--json` implemented in `src/cli/handoff.ts`: `hasFlag`, `writeJsonFile` sidecar `<work>.json`, usage updated. Existing `tests/cli-handoff.test.ts` still 7/7. Clone also ran `npm install` (`package-lock.json`). |
| Decision | Sidecar JSON next to markdown; markdown path unchanged |
| Unresolved | Tests and documentation for `--json` not started |
| Correct next work | Add tests (and optionally docs) for `--json`; do not re-implement the flag |
| Wrong next work | Re-apply the same `--json` patch as if `src/cli/handoff.ts` never changed |

OpenCode model: `opencode` / `mimo-v2.5-free`. Production `opencode.db` mtime unchanged (`1788406866`). Raw OpenCode DB and snapshot stay in `/tmp` (not committed).
