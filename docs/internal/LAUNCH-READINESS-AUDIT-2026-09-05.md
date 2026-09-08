# Harnie product progress and launch readiness

Audit date: September 5, 2026. Baseline: `e79c7a072e4d0502a5c3c747eeee8f7ddd2c1f28` plus the existing working-tree changes, including Sprint 025. This is an implementation and product-readiness audit, not a claim of exhaustive security or compatibility certification.

## Decision

**Harnie is a substantial local CLI prototype with limited live validation of its core thesis. It is not ready for a broad public beta today. Prioritize a launch-hardening milestone, then release a narrowly scoped developer preview.**

The product already spans roadmap Phases 0–5: three import adapters, three Markdown handoff targets, SQLite Work, multiple executions, history, differences, checkpoints, and forks. The missing work is concentrated in reliable distribution, correctness across evolving sessions, trustworthy continuation state, and onboarding. Adding more harnesses, cloud services, orchestration, or a UI would postpone the more valuable work.

There is no defensible single “percent complete”: the roadmap mixes experiments, product capabilities, and long-term infrastructure. Feature breadth is well ahead of launch maturity. Sprint completion should be reported separately from user-facing reliability and evidence of benefit.

## Evidence and scope

- Reviewed the internal roadmap, architecture and implementation plan; sprint status and relevant acceptance criteria through Sprint 025; research outcomes and continuation scores; CLI, adapters, derivation, persistence, history/checkpoint/handoff paths, and associated tests.
- Ran `npm run check`: **39 test files, 191 tests passed**, with TypeScript checking clean. Runtime: Node **22.23.0**. SQLite emitted experimental-feature warnings.
- Ran `npm run harnie -- --help`: **failed with `ERR_MODULE_NOT_FOUND`** for `src/cli/checkpoint.js`.
- Emitted a temporary JavaScript build outside the repository and ran targeted probes against disposable SQLite stores and synthetic/committed fixtures. These reproduced the correctness findings below. No production harness sessions or databases were used.
- No GitHub Actions workflow is present. The Agent CI skill was inspected, but there is no repository workflow to execute through it; the declared local check was run directly.
- Existing uncommitted files were left intact. This audit adds only this report. No new paid/live agent continuation, clean-machine package installation, multi-platform validation, concurrency stress test, or long-session benchmark was performed.

## Product progress against the docs

| Roadmap area | Current implementation | Assessment |
| --- | --- | --- |
| Phase 0: feasibility | Pi → Work → OpenCode; recorded sandbox and repository-clone continuation runs | Thesis supported in limited scenarios; not broadly validated |
| Phase 1: local Work | SQLite, events, executions, provenance, rule-derived claims, inspection and repeat import | Substantial implementation; evolving/multi-execution correctness needs repair |
| Phase 2: bidirectional support | Pi, OpenCode and Codex import; Markdown output to all three | Implemented surface exceeds README; compatibility maturity differs by adapter |
| Phase 3: history | `executions`, `history`, `diff <work> <execution-a> <execution-b>` | Implemented; correctness inherits the underlying state issues |
| Phase 4: context | Relevant/changed files, observed revision, failed operations, test state, read excerpts and continuation hints | Partial context reconstruction, not general semantic understanding or a bounded context budget |
| Phase 5: checkpoints/forks | Snapshot claims, event watermarks, forks, checkpoint-scoped handoffs | Implemented and tested in working tree; legacy migration and snapshot durability need hardening |
| Phase 6: interchange | No Work export/import format or versioned portable schema | Not implemented |
| Phase 7: machine interface | Internal TypeScript exports; no CLI JSON contract, MCP or packaged API | Preliminary internal surface only |
| Phases 8–9: multi-machine/coordination | No synchronization or orchestration | Deferred appropriately; unnecessary for first launch |

Evidence: [roadmap](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/docs/internal/ROADMAP.md>), [CLI](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/cli.ts>), [domain types](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/work/types.ts>), [context extraction](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/work/context.ts>), [public source exports](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/index.ts>), and [Sprint 025](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/docs/internal/Sprints/Sprint 025 — Checkpoint-Scoped Handoff.md>).

The architecture's main separation is present: harness readers/normalizers feed neutral Work, then a neutral handoff builder feeds target renderers. Source ingestion is observational; the OpenCode SQLite reader explicitly opens read-only. There is no automatic command replay or hosted dependency in this path. Provenance and deterministic extraction are good foundations to preserve.

Some architectural objects remain simplified: Workspace holds only a path; Work lacks the planned title/status lifecycle; execution metadata is limited; artifacts/context are largely projections from operations. This is acceptable for a preview if described accurately, rather than presented as the full durable Work model.

## What continuation has actually proved

| Path | Evidence | Limits |
| --- | --- | --- |
| Pi → OpenCode | Sprint 011 sandbox PASS; Sprint 012 Harnie clone PASS | Narrow tasks, model/provider retries, no fresh-session control |
| OpenCode → Pi | Sprint 016 Harnie clone PASS | Receiver preserved existing edits and ran checks, but did not finish missing tests; mixed completion reporting |
| Codex source/output | Fixture tests and static scoring | Sprint 017 explicitly used invented sanitized rollout data; no equivalent recorded live continuation gate found |

Sources: [Sprint 011](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/docs/research/sprint-011-outcome.md>), [Sprint 012](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/docs/research/sprint-012-outcome.md>), [Sprint 016](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/docs/research/sprint-016-outcome.md>), [Sprint 017](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/docs/research/sprint-017-outcome.md>), [Sprint 018](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/docs/internal/Sprints/Sprint 018 — Codex Handoff Renderer.md>).

The evidence supports “a receiver can use Harnie state to continue selected tasks.” It does not yet quantify saved tokens, time, re-investigation, or developer effort. The `--json` work in those experiments exists in evaluation clones, **not in this product**. The live evaluations also predate the newest history/checkpoint/context work.

## Launch findings, prioritized

### 1. P1 — The declared CLI launch path is broken

**Reproduced.** `npm run harnie -- --help` fails before argument handling. The script executes TypeScript with Node type stripping, while source imports refer to `.js`; `build` is only `tsc --noEmit`. The package points its executable at `src/cli.ts`, is private, has version `0.0.0`, and declares no runtime engine range. The README uses an externally fetched `tsx` workaround that is not a declared dependency.

**Recommendation:** emit distributable JavaScript, point the executable to that output, retain a separate typecheck, declare the tested Node range, and test a packed installation in an empty directory. Treat successful installed `--help`, `init`, fixture import and handoff as release requirements. This fixes first-run UX, reproducibility for developers, and dependable agent invocation together.

Evidence: [package.json](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/package.json>), [entry point](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/cli.ts>), [README](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/README.md>).

### 2. P1 — Re-importing the original session removes attached execution context

**Reproduced with committed fixtures.** Import Pi Trace B; attach the Codex fixture to its Work; import the original Pi file again without `--work`. The store retains **26 events and 2 executions**, but operations fall from **9 to 6** and the Codex `src/cli.ts` operation disappears from derived state.

The ordinary import derives only the incoming session. Persistence keeps existing events but deletes/replaces all Work-level derived claims from that partial input. History and the continuation package can consequently disagree.

**Recommendation:** merge the incoming execution into the complete persisted Work before deriving, for both ordinary and explicit attach imports. Preserve append-only evidence while updating the complete projection transactionally. Add a regression asserting unchanged attached claims after original-session refresh.

Evidence: [import engine](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/engine/import.ts>), [derived persistence](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/store/persist.ts>).

### 3. P1 — An attached session can remain pending after its result arrives

**Reproduced with a synthetic Pi session.** Import a pending `read config.ts`; append its successful result; refresh with `--work <same-work>`. The operation has both call and result evidence but still says `pending`, and the next step remains “Complete pending tool call read config.ts.”

Attach retains the old event diagnostics and unions Work diagnostics. Operation status gives the retained `missing_tool_result` diagnostic precedence over the newly available result. Ordinary refresh can also retain stale event diagnostics even when its initially computed operations are fresh, so subsequent derivation deserves regression coverage.

**Recommendation:** distinguish immutable source evidence from recomputable correlation diagnostics. Reconcile completion over the updated execution before deriving next steps. This prevents redundant reads and potentially repeated side effects for developers and receiving agents.

Evidence: [attach merge](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/work/observe.ts>), [operation status](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/work/operations.ts>), [next-step derivation](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/work/derive.ts>).

### 4. P1 — Tool-result matching is not scoped to execution

**Reproduced at the Work boundary.** A call in execution A with ID `call-1` and a successful result in execution B with the same ID makes A's operation appear successful. The result index uses only the call ID across the entire Work. This is conditional on ID reuse, but independent executions should not need globally unique tool IDs for correctness.

**Recommendation:** correlate using execution identity plus tool-call identity, including the handoff fallback and unmatched-call helpers. Test reused IDs with opposing outcomes and unresolved calls. False success is especially damaging to continuity: it can cause the next agent to skip necessary work.

Evidence: [operation index](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/work/operations.ts>), [handoff fallback](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/work/handoff.ts>), [derivation fallback](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/work/derive.ts>).

### 5. P1 — Legacy checkpoint migration fails

**Reproduced with a synthetic legacy-shaped checkpoint table.** A table whose `execution_id` references executions triggers the migration branch; `loadWork` fails with `no such column: rowid` when it attempts `CREATE INDEX ... ON checkpoints(work_id, rowid)`. The migration rolls back. The normal schema setup catches this error, but the migration branch does not. The existing old-database test lacks this checkpoint shape.

**Recommendation:** use a valid explicit index, introduce versioned transactional migrations and test populated databases from each supported prior schema, including checkpoints/forks. Verify row preservation and foreign-key integrity. Document backup/recovery before inviting users to trust durable history.

Evidence: [migration](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/store/persist.ts>), [schema](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/store/schema.ts>), [existing migration test](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/tests/cli-fork.test.ts>).

### 6. P1 — Verification guidance ignores whether tests happened after edits

**Reproduced at the handoff boundary.** A successful `npm test` followed by an edit yields `Test state: npm test — succeeded` and no next steps, while Current state says verification was not recorded. Any recognized test command populates `testState`; its presence suppresses the verification hint regardless of order or success.

**Recommendation:** associate verification with an execution and event/revision watermark. Distinguish tests before the latest edit, failed tests, pending tests, and successful post-edit verification. Render one consistent status and an appropriate next action. Do not let a command's presence stand in for verified current work.

Evidence: [context extraction](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/work/context.ts>), [current state](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/work/handoff.ts>).

### 7. P1 before public use — The documented identifiable-secret boundary is missing

**Reproduced with fake data only.** A user message containing `API_KEY=HARNIE_FAKE_SECRET_AUDIT_ONLY` survives in persisted Work and the handoff goal. No import/output redaction policy is implemented. Fixtures being sanitized does not sanitize users' sessions. Directory/file permissions rely on the process defaults.

**Recommendation:** meet the implementation plan's existing requirement to avoid persisting obvious identifiable secrets: define a conservative redaction policy at ingestion and output, preserve a redaction marker and provenance, add synthetic credential fixtures, and use private local file permissions. Explain what is retained locally and that handing the artifact to another agent may transmit its contents through that agent's provider. Add a clear receiver instruction that historical commands and permissions are evidence, not current authorization.

This is a concrete mismatch with [implementation security requirements](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/docs/internal/IMPLEMENTATION.md>), not evidence of an actual credential incident. Harnie itself was not observed uploading content.

Evidence: [payload persistence](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/store/persist.ts>), [goal derivation](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/work/derive.ts>), [store creation](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/store/database.ts>), [handoff renderer](</Users/sergio/Documents/Developer/BoringInfraCo/Harnie/src/handoff/opencode.ts>).

## Product and documentation gaps after the correctness gate

**Onboarding and discovery.** `detectPiSourceFamilyFromHeader` identifies a file format, not local session locations. CLI imports require paths; OpenCode CLI import accepts a Harnie-shaped JSON snapshot even though a read-only SQLite reader exists internally. Provide one documented, supported path from a user's actual session to import. Start with a small session-list/select or snapshot-export workflow and actionable errors. The README omits Codex output, attach, history, diff, checkpoints and forks. Give users an example fixture, expected output, artifact location, and precise receiver instructions.

**Honest semantics.** Goal is the first user message, decisions are assistant “I will” sentences, and findings are assistant sentences after tool results. Provenance makes these traceable, not necessarily true, current, or settled decisions. Label these as rule-derived claims; distinguish plans from decisions and observations from assertions. Prefer bounded improvements driven by failed examples over introducing a model dependency immediately.

**Bounded packages and traceability.** The newest handoff limits findings to five, but goals, decisions, operations, paths and other sections can still grow without a total budget. Markdown also loses the per-claim evidence structure retained in Work. Add a deterministic size budget with explicit omitted counts and evidence references, then benchmark long and multi-execution sessions. A short package should preserve uncertainty and unresolved work first.

**Machine interface.** Add opt-in, schema-versioned `--json` to inspection and handoff commands, with stable error codes, while preserving existing text output. Reject unknown/duplicate import flags consistently: its parser currently skips unknown flags. Expose capabilities and source-format limitations as data so agents can decide what to request without scraping prose. MCP can follow later; a reliable CLI contract delivers earlier UX/DX/AX value.

**Snapshot integrity and operations.** Checkpoint creation reads semantic state before beginning its transaction, and historical projection uses current workspace/execution metadata. Those are code-inspection concerns, not concurrent-write or metadata-drift failures reproduced in this audit. Add focused snapshot tests before promising exact historical state under concurrent refresh. Fork creation also commits event copying before a separate derivation write. Keep the preview single-writer until these guarantees are tested, or make the operations atomic.

**Documentation status.** Retain the original implementation plan as historical intent, but mark its V0-only scope as superseded. Add one current capability/compatibility matrix and launch checklist. Do not treat every “Complete — GO” sprint as evidence of production readiness. Keep the limited dogfood outcomes and their missing controls visible.

## Recommended launch sequence and acceptance gates

| Order | Deliverable | Gate to advance |
| --- | --- | --- |
| 1 | Repair distribution and reproduced continuity/migration bugs | Installed CLI works; regressions for Findings 2–6 pass; all existing 191 tests remain green |
| 2 | Protect retained/output data and harden storage upgrades | Fake secrets redacted with traceability; supported legacy stores upgrade without loss; backup/restore verified |
| 3 | Deliver a complete first-run journey and honest support matrix | A new developer imports a fixture and their own supported session, finds the handoff, and continues it using the docs alone |
| 4 | Add a minimal stable machine contract and bounded handoffs | JSON schema/error tests, deterministic output and explicit truncation; text compatibility retained |
| 5 | Re-run continuation evaluation on the release candidate | Unrelated repository tasks, bidirectional paths, baseline comparison, and raw outcome evidence recorded |
| 6 | Tag and release a developer preview | Named release candidate, green automated checks, tested install instructions, known limitations, and recovery instructions |

Recommended preview promise: **“Import supported local coding sessions, inspect evidence-backed work history, and prepare Markdown continuation packages.”** Describe Codex as experimental until real sanitized source fixtures and live receiver/source evaluations support stronger claims. Do not claim native resume, universal session compatibility, or quantified productivity savings yet.

For the new evaluation, record developer re-explanation, repeated investigation, whether finished edits were repeated, correctness of the next action, missing/false context, package size, and task completion. Compare the handoff with a fresh receiver on the same task state. Report failures and model/environment details rather than only a GO label. For the initial preview gate, require no false completion or repeated completed edits in the selected benchmark tasks; use measured results to set broader performance targets.

The strongest joint UX/DX/AX investment is **a reliable import → inspect → handoff contract**: accurate state for users, reproducible behavior and migrations for developers, and structured, bounded, explicitly evidenced context for agents. The code already provides the foundation. The next milestone should make that foundation dependable enough to launch.
