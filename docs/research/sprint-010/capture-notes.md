# Sprint 010 capture notes

Evidence cutoff: 2026-09-02.

Evaluation capture only. No product change. No live Pi session. No `opencode run`. `~/.harnie` was not used and did not exist before or after this run.

## Method

`runCli` from `src/cli.ts` against a `mkdtemp` home:

```text
harnie init
harnie import pi <fixture>
harnie show <work>
harnie handoff <work> --to opencode
```

Stdout of `show` and `handoff` was saved as-is. The temp home was deleted after the run.

Fixtures used (same unfinished-work evidence as Sprint 008):

| Label | Fixture | Work id |
|---|---|---|
| Fixture C | `tests/fixtures/pi/stateful-prefix.jsonl` | `work:pi:ba67782f-c80e-4287-aa82-b8e8d08a839a` |
| Trace B | `tests/fixtures/pi/trace-b-unfinished.jsonl` | `work:pi:harnie-tb-da82c4f8` |

## Sizes (UTF-8 bytes)

| Item | Fixture JSONL | `show` stdout | `handoff` stdout | handoff / fixture |
|---|---:|---:|---:|---:|
| Fixture C | 6685 | 811 | 1177 | 0.176 |
| Trace B | 5098 | 757 | 1055 | 0.207 |

Versus Sprint 008 (`docs/research/sprint-008/fixture-c-handoff.md` and `trace-b-handoff.md`, still present):

| Item | Sprint 008 handoff | Sprint 010 handoff | Δ bytes | 010 / 008 |
|---|---:|---:|---:|---:|
| Fixture C | 673 | 1177 | +504 | 1.749 |
| Trace B | 746 | 1055 | +309 | 1.414 |

Show stdout also grew (Fixture C 501 → 811, +310; Trace B 523 → 757, +234) from the new Operations section.

Handoff markdown is still substantially smaller than the source JSONL (about 18% and 21%). These fixtures are already short sanitized prefixes, so the ratio is not a claim about long live sessions.

## Handoff file on disk

Yes. `harnie handoff` also wrote under the temp home:

```text
<tmp>/handoffs/work_pi_ba67782f-c80e-4287-aa82-b8e8d08a839a.md   1177 bytes
<tmp>/handoffs/work_pi_harnie-tb-da82c4f8.md                     1055 bytes
```

Each file matched stdout byte-for-byte. Nothing was written to `~/.harnie`.

## Handoff source

The handoff is from persisted Work, not from re-reading Pi JSONL.

- CLI path: `loadWork` → `buildHandoffFromWork` → `renderOpenCodeHandoff`.
- Captured markdown is a continuation prompt (`# Harnie handoff`), not JSONL. Source fixtures start with `{"type":"session",...}`.
- Provenance lines name the Work id, e.g. `Work work:pi:ba67782f-c80e-4287-aa82-b8e8d08a839a`.
- Fixture C handoff carries the derived goal / “I will” decision / `models.ts` finding, plus current state `Edits reported success on packages/ai/src/models.ts, packages/agent/src/types.ts. Verification not recorded.`
- Trace B handoff carries `Unresolved: Complete pending tool call read .git/config` and `missing_tool_result`; it does not claim the investigation is complete.

## Operations / Files touched

Both sections appear on both OpenCode handoffs.

**Fixture C handoff**

- `## Files touched` — `packages/ai/src/models.ts`, `packages/agent/src/types.ts`
- `## Operations` — successful `bash` searches, then `read`/`edit` of both files marked `succeeded`

**Trace B handoff**

- `## Files touched` — `README.md`, `analysis.js`, `config.json`, `.git/config`
- `## Operations` — successful reads of the first three plus two `bash` commands, then `read .git/config — pending`

`harnie show` prints an `Operations` section (same lines, `•` bullets) but not `Files touched`. Event kinds remain `tool_call` / `tool_result`; no `file_read` / `file_write`.

## Captured files

- `docs/research/sprint-010/fixture-c-show.txt`
- `docs/research/sprint-010/fixture-c-handoff.md`
- `docs/research/sprint-010/trace-b-show.txt`
- `docs/research/sprint-010/trace-b-handoff.md`

OpenCode continuation was not run in this capture.
