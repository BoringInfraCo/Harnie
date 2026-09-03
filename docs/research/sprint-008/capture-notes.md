# Sprint 008 capture notes

Evidence cutoff: 2026-09-01.

Evaluation capture only. No product change. No live Pi session. `~/.harnie` was not used and did not exist before or after this run.

## Method

`runCli` from `src/cli.ts` against a `mkdtemp` home:

```text
harnie init
harnie import pi <fixture>
harnie show <work>
harnie handoff <work> --to opencode
```

Stdout of `show` and `handoff` was saved as-is. The temp home was deleted after the run.

Fixtures used (the unfinished-work evidence available in-repo):

| Label | Fixture | Work id |
|---|---|---|
| Fixture C | `tests/fixtures/pi/stateful-prefix.jsonl` | `work:pi:ba67782f-c80e-4287-aa82-b8e8d08a839a` |
| Trace B | `tests/fixtures/pi/trace-b-unfinished.jsonl` | `work:pi:harnie-tb-da82c4f8` |

## Sizes (UTF-8 bytes)

| Item | Fixture JSONL | `show` stdout | `handoff` stdout | handoff / fixture |
|---|---:|---:|---:|---:|
| Fixture C | 6685 | 501 | 673 | 0.101 |
| Trace B | 5098 | 523 | 746 | 0.146 |

Handoff markdown is substantially smaller than the source JSONL (about 10% and 15%). These fixtures are already short sanitized prefixes, so the ratio is not a claim about long live sessions.

## Handoff file on disk

Yes. `harnie handoff` also wrote under the temp home:

```text
<tmp>/handoffs/work_pi_ba67782f-c80e-4287-aa82-b8e8d08a839a.md   673 bytes
<tmp>/handoffs/work_pi_harnie-tb-da82c4f8.md                     746 bytes
```

Each file matched stdout byte-for-byte. Nothing was written to `~/.harnie`.

## Handoff source

The handoff is from persisted Work, not from re-reading Pi JSONL.

- CLI path: `loadWork` → `buildHandoffFromWork` → `renderOpenCodeHandoff`.
- Captured markdown is a continuation prompt (`# Harnie handoff`), not JSONL.
- Provenance lines name the Work id, e.g. `Work work:pi:ba67782f-c80e-4287-aa82-b8e8d08a839a`.
- Fixture C handoff carries the derived goal / “I will” decision / `models.ts` finding, not event payloads.
- Trace B handoff carries `Unresolved: Complete pending tool call read` and `missing_tool_result`; it does not claim the investigation is complete.

## Captured files

- `docs/research/sprint-008/fixture-c-show.txt`
- `docs/research/sprint-008/fixture-c-handoff.md`
- `docs/research/sprint-008/trace-b-show.txt`
- `docs/research/sprint-008/trace-b-handoff.md`

OpenCode continuation was not run in this capture. That remains the rest of Sprint 008.
