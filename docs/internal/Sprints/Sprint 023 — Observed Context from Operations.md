# Sprint 023 — Observed Context from Operations
**Status:** Complete — GO
**Phase:** 4 — Context Reconstruction
**Type:** Implementation
**Depends on:** Sprint 022 — GO

## Objective

Turn the operations skeleton into the smallest *observed* context package:
repository identity, file roles, failed approaches, and test state — without
dumping transcripts.

```text
Work.operations (+ notes already stored)
        ↓
extractObservedContext
        ↓
Handoff / show  (revision, relevant vs changed, failed, tests)
```

## Sprint question

Can a receiving agent learn HEAD SHA, which files were read vs already edited,
which approaches failed, and whether tests ran — from Work, without file
bodies and without the handoff approaching transcript size?

## Scope

1. `src/work/context.ts`: `extractObservedContext(work)` from
   `Work.operations` (else `extractToolOperations`). No new event kinds.
   No model. No live git. No disk inspection.
2. Classification (all observed):
   - **Revision:** last succeeded `git log` / `git rev-parse` / `git status`
     whose note contains a SHA (`[0-9a-f]{7,40}`). Omit if none.
   - **Relevant files:** succeeded `read` / `cat` paths. Pending paths
     (Trace B `.git/config`) stay out.
   - **Changed files:** succeeded `edit` / `write` / `apply_patch` /
     `str_replace` paths.
   - **Failed approaches:** `status === "failed"` lines
     (`tool path|command — failed` plus capped note). No narrative.
   - **Test state:** commands matching `vitest` / `npm test` / `pnpm test` /
     `yarn test` / `pytest` / `cargo test` → `{command} — {status}`
     (last match wins if several).
   - **Read yields:** first-line `note` on succeeded reads only, already
     clipped to 120 chars. Skip generic bash (`ls`, `pwd`) even if a note
     exists. Format `path — note`.
3. `Handoff` (`src/work/handoff.ts`): add optional `executions`,
   `revision`, `relevantFiles`, `changedFiles`, `failedApproaches`,
   `testState`, `readYields`. `buildHandoffFromWork` calls
   `extractObservedContext`. Keep `filesTouched` (all operation paths)
   for Sprint 009 tests. **Multi-exec:** populate `executions` with every
   execution; `execution` remains the first entry for existing renderers
   that still read it; provenance lists all harnesses/sessions, not only
   `executions[0]`.
4. Renderers (`src/handoff/{opencode,pi,codex}.ts`): new sections only
   when non-empty — Repository, Relevant files, Changed files, Failed
   approaches, Test state, Read yields. When Relevant or Changed is
   non-empty, omit undifferentiated `Files touched` (paths must not print
   three times). Format all executions when `executions.length > 1`.
5. `harnie show` prints the same classified facts (aligned with handoff).
   Place after Operations, before Checkpoints.
6. Tests:
   - Trace B: revision `47da672`; relevant `README.md`, `analysis.js`,
     `config.json`; `.git/config` not in relevant; no `ls` listing in
     yields; yield includes `# Mystery Project`; compactness JSON and
     markdown `< 50%` of JSONL.
   - Fixture C: changed `packages/ai/src/models.ts` and
     `packages/agent/src/types.ts`; no invented revision; `rg` is not a
     changed file; compactness holds.
   - Synthetic failed write: Failed approaches, not success.
   - Attached Pi+Codex work: handoff names **both** harnesses.
7. Export `extractObservedContext` from `src/index.ts`.

## Freeze

No `--checkpoint` / handoff-from-checkpoint (later sprint).
No `contexts` table, no artifacts table, no workspace schema columns.
No live `git` / disk inspection at import or handoff.
No file bodies, diffs, or full tool-result payloads. Notes stay ≤ 120 chars.
No model-assisted derivation. No new CLI command. No Phase 6 export.
No native resume. Do not change goal / decision / finding rules.

## Evaluation

`npx tsc --noEmit`: clean. `npx vitest run`: 38 files, 175 tests pass
(37/166 at Sprint 022 + 1 file / 9 tests). Trace B handoff/show carry
`47da672` and `README.md — # Mystery Project` without the `ls` tree or
README body. Fixture C names both edit paths as changed files and does
not invent a revision. Attached Codex+Pi work lists both harnesses in
`executions` and provenance. Handoff JSON and OpenCode markdown stay
under half of each fixture JSONL. No schema migration, no live git,
no `--checkpoint`.

## North star

The next harness does not have to rediscover HEAD or which files already
changed, and still does not receive a transcript.
