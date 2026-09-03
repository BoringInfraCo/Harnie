# Sprint 010 Outcome — Re-evaluate OpenCode Handoff

Status: **GO** (Sprint 009 holes closed). Overall V0 live continuation remains **unproven**.  
Evidence cutoff: 2026-09-02

## Sprint question

> Does the handoff now tell a receiving agent which files were touched and which edits already reported success, without dumping the transcript?

Answer: **yes.**

## Capture

Temp `HARNIE_HOME` (not `~/.harnie`). No `opencode run`. Artifacts in `docs/research/sprint-010/`.

| Case | JSONL | Handoff 008 | Handoff 010 | Ratio vs JSONL |
|---|---:|---:|---:|---:|
| Fixture C | 6685 B | 673 B | 1177 B | 0.18 |
| Trace B | 5098 B | 746 B | 1055 B | 0.21 |

Still compact. Not a transcript dump (no file bodies, no diffs).

## Sprint 009 holes

**Closed.**

Fixture C names `packages/ai/src/models.ts` and `packages/agent/src/types.ts`, both `edit … — succeeded`, current state: “Edits reported success … Verification not recorded.” A receiver should not redo those edits.

Trace B names `README.md`, `analysis.js`, `config.json` as successful reads, and pending `read .git/config`. It does not claim the investigation is complete.

## Step 20 score vs Sprint 008

| Question | C 008 → 010 | B 008 → 010 |
|---|---|---|
| goal | present → present | present → present |
| completed work | misleading → **present** | absent → **partial** |
| important files | partial → **present** | absent → **present** |
| decisions | present → present | absent → absent |
| failed approaches | absent → absent | absent → absent |
| repo revision / dirty | absent → absent | absent → absent |
| unresolved | absent → **present** | partial → partial |
| next step | absent → **partial** | partial → **present** |

## What is still unproven

- **Live OpenCode** was not run (not authorized). Fresh session vs Harnie is still not scored.
- Trace B lists files read, not what they contained; `git log` SHA is dropped.
- Git branch/revision still absent on both.
- Unattended “Continue the work.” on Trace B would still re-read file contents.

Those are later conditions, not a reopen of the 009 holes.

## Decision

**GO** for Sprint 010.

The package now carries touched files and tool-reported success/failure. V0’s live continuation experiment is still **Conditional GO** until an authorized `opencode run`.

## Sprint 011 recommendation

Do not add more product surface until a live continuation is either run or explicitly deferred. If authorized: `opencode run` with the Fixture C handoff and only “Continue the work.” Score behavior. If not authorized: stop Phase 0 feature work and treat live eval as a human dogfood gate.
