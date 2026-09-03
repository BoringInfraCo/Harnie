# Sprint 008 Outcome — OpenCode Continuation Evaluation

Status: **Conditional GO**  
Evidence cutoff: 2026-09-01

## Sprint question

> Does OpenCode meaningfully continue the Pi work with substantially less developer re-explanation than starting over?

Answer: **not proven.** Harnie can emit a compact Work-backed OpenCode prompt. That prompt is not a reformatted transcript. It is also **too thin** for unattended “Continue the work.” A live OpenCode continuation was **not run**.

## What was evaluated

Not a new live Pi coding task. Available unfinished evidence:

| Case | Source | Work id |
|---|---|---|
| Fixture C | `tests/fixtures/pi/stateful-prefix.jsonl` | `work:pi:ba67782f-c80e-4287-aa82-b8e8d08a839a` |
| Trace B | `tests/fixtures/pi/trace-b-unfinished.jsonl` | `work:pi:harnie-tb-da82c4f8` |

Protocol used (temp `HARNIE_HOME`, never `~/.harnie`):

```text
harnie init
harnie import pi <fixture>
harnie show <work>
harnie handoff <work> --to opencode
```

Artifacts: `docs/research/sprint-008/`.

## Compactness

| Case | JSONL | Handoff | Ratio |
|---|---:|---:|---:|
| Fixture C | 6685 B | 673 B | 0.10 |
| Trace B | 5098 B | 746 B | 0.15 |

The handoff is Work-derived markdown (`provenance` names the Work id). It is **not** a restated JSONL log. V0’s “handoff approaches transcript size” failure did **not** fire.

## Package score (not live OpenCode)

From `docs/research/sprint-008/package-score.md`:

| Question | Fixture C | Trace B |
|---|---|---|
| original goal | present | present |
| completed work | **misleading** | absent |
| important files | partial | absent |
| decisions | present | absent |
| failed approaches | absent | absent |
| repo revision / dirty files | absent | absent |
| unresolved problem | absent | partial |
| next step | absent | partial |

Fixture C still says “I will update that predicate…” after both edits already succeeded, with no current-state line. A receiver can re-implement finished work. Trace B’s next step is “Complete pending tool call read” with **no path** (source was `.git/config`) and **no list of files already read**.

Would a developer still have to explain progress, files, and the next change? **Yes.** The goal is in the package; the memory of what already happened is not.

**Package verdict: insufficient** for unattended continuation.

## Live OpenCode

From `docs/research/sprint-008/opencode-probe.md`:

- OpenCode **1.18.26** is on PATH (`~/.opencode/bin/opencode`).
- Pi **0.84.4** is on PATH.
- Auth exists (Anthropic, MiniMax, OpenCode Go). Keys were not read.
- Non-interactive path: `opencode run [message..]`, optional `-f` file.
- **`opencode run` was not executed.** It would call a model, use credentials, and write OpenCode session state. There is no offline dry-run continuation.
- Fresh-session vs Harnie-handoff comparison **was not performed.**

Help/debug probes may have checkpointed `~/.local/share/opencode/opencode.db` (WAL). No `run` or `import`. `~/.harnie` was not created.

## Decision

**Conditional GO.**

Not a full GO: the V0 experiment (live OpenCode continues Pi work with less re-explanation) is incomplete, and the captured package would still force re-investigation.

Not a NO-GO: the handoff is not a transcript dump, goals survive, Trace B does not fake completion, and the pipeline is Work → Handoff → OpenCode markdown.

### Conditions to promote to GO

1. Lift **observed** file paths and tool-reported successes/failures into Work/handoff (deterministic, from `tool_call` arguments and `tool_result` text). Fixture C must not invite re-edits. Trace B must name files already read and the pending `.git/config` path.
2. Run a **live** OpenCode continuation (`opencode run` with the handoff, prompt only “Continue the work.”) on a real unfinished task, and score behavior against IMPLEMENTATION.md step 20. Explicitly authorized; it will use credentials and write OpenCode state.

Do not hide this result by adding unrelated features.

## Sprint 009 recommendation

Implementation, then re-evaluate. Smallest next slice: **observed tool operations on the handoff** (paths from `read`/`write`/`edit`/`bash` arguments, success/`isError` from results), labeled observed or convention-based, never as `file_read` event kinds if Sprint 002 still forbids that. Then repeat Sprint 008 live if the user authorizes `opencode run`.
