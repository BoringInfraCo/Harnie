import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderCodexHandoff } from "../handoff/codex.js";
import { renderGrokHandoff } from "../handoff/grok.js";
import { renderOpenCodeHandoff } from "../handoff/opencode.js";
import { renderPiHandoff } from "../handoff/pi.js";
import { initHarnieStore, resolveHarnieHome } from "../store/database.js";
import { loadWorkAtCheckpoint } from "../store/fork.js";
import { loadWork } from "../store/persist.js";
import { buildHandoffFromWork, applyOutputRedaction } from "../work/handoff.js";
import { classifyErrorText, type CliErrorCode } from "../contract/errors.js";
import { emitJsonFailure, emitJsonSuccess } from "../contract/envelope.js";
import { FlagParseError, parseFlags } from "../contract/flags.js";

export interface RunHandoffOptions {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

type HandoffTarget = "opencode" | "pi" | "codex" | "grok";

const usage = "Usage: harnie handoff <work> [--checkpoint <id>] --to <target> [--json]\n";

export const runHandoff = async (argv: string[], options: RunHandoffOptions): Promise<number> => {
  // JSON mode is decided by the presence of --json so that a failure early in
  // parsing (unknown flag, duplicate flag) still produces a JSON envelope.
  const json = argv.includes("--json");
  const parsed = parseHandoffArgs(argv);

  if (!("target" in parsed)) {
    if (json) {
      return emitJsonFailure(options.stdout, "handoff", parsed.code, parsed.message);
    }
    // Text behavior preserved: argument-shape failures print usage.
    options.stderr.write(usage);
    return 1;
  }
  const { workId, target, checkpointId } = parsed;

  if (!isHandoffTarget(target)) {
    const message = `Target "${target}" is not implemented.`;
    if (json) return emitJsonFailure(options.stdout, "handoff", "unsupported", message);
    options.stderr.write(`${message}\n`);
    return 1;
  }

  try {
    const home = resolveHarnieHome(options.home ?? process.env.HARNIE_HOME);
    const store = initHarnieStore({ home });
    try {
      const work = checkpointId === undefined
        ? loadWork(store, workId)
        : loadWorkAtCheckpoint(store, workId, checkpointId);
      if (work === undefined) {
        const message = `Work not found: ${workId}`;
        if (json) return emitJsonFailure(options.stdout, "handoff", "not_found", message);
        options.stderr.write(`${message}\n`);
        return 1;
      }

      const handoff = buildHandoffFromWork(work);
      const rendered =
        target === "pi"
          ? renderPiHandoff(handoff)
          : target === "codex"
            ? renderCodexHandoff(handoff)
            : target === "grok"
              ? renderGrokHandoff(handoff)
              : renderOpenCodeHandoff(handoff);
      // Renderers already redact; this final pass is an idempotent backstop
      // so CLI/file output stays redacted even if a renderer path changes.
      const markdown = applyOutputRedaction(rendered);
      const file = writeHandoffFile(home, work.id, markdown, target, checkpointId);
      if (json) {
        return emitJsonSuccess(options.stdout, "handoff", buildHandoffData(handoff, {
          target,
          ...(checkpointId !== undefined ? { checkpointId } : {}),
          file,
        }));
      }
      options.stdout.write(markdown);
      return 0;
    } finally {
      store.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = classifyErrorText(message);
    if (json) return emitJsonFailure(options.stdout, "handoff", code, message);
    options.stderr.write(`${message}\n`);
    return 1;
  }
};

const isHandoffTarget = (value: string): value is HandoffTarget =>
  value === "opencode" || value === "pi" || value === "codex" || value === "grok";

interface ParsedHandoffArgs {
  readonly workId: string;
  readonly target: string;
  readonly checkpointId?: string;
}

interface FailedHandoffParse {
  readonly code: CliErrorCode;
  readonly message: string;
}

/**
 * On success returns the parsed arguments. On failure returns a stable error
 * code plus message (text mode prints usage for any of them; JSON mode
 * surfaces the code).
 */
const parseHandoffArgs = (argv: readonly string[]): ParsedHandoffArgs | FailedHandoffParse => {
  try {
    const parsed = parseFlags(argv, {
      "--to": { kind: "value" },
      "--checkpoint": { kind: "value" },
      "--json": { kind: "switch" },
    });
    const workId = parsed.positionals[0];
    const target = parsed.values["--to"];
    const checkpointId = parsed.values["--checkpoint"];
    if (parsed.positionals.length > 1) {
      return { code: "invalid_input", message: "harnie handoff takes exactly one work id." };
    }
    if (workId === undefined || workId === "") {
      return { code: "missing_argument", message: "harnie handoff requires a work id." };
    }
    if (target === undefined) {
      return { code: "missing_argument", message: "harnie handoff requires --to <target>." };
    }
    return {
      workId,
      target,
      ...(checkpointId !== undefined ? { checkpointId } : {}),
    };
  } catch (error) {
    if (error instanceof FlagParseError) {
      return { code: error.code, message: error.message };
    }
    throw error;
  }
};

const buildHandoffData = (
  handoff: ReturnType<typeof buildHandoffFromWork>,
  meta: { target: HandoffTarget; checkpointId?: string; file: string },
) => ({
  workId: handoff.workId,
  target: meta.target,
  ...(meta.checkpointId !== undefined ? { checkpointId: meta.checkpointId } : {}),
  file: meta.file,
  sections: {
    ...(handoff.goal !== undefined ? { goal: handoff.goal } : {}),
    ...(handoff.currentState !== undefined ? { currentState: handoff.currentState } : {}),
    decisions: handoff.decisions,
    findings: handoff.findings,
    nextSteps: handoff.nextSteps,
    operations: handoff.operations,
    filesTouched: handoff.filesTouched,
    ...(handoff.revision !== undefined ? { revision: handoff.revision } : {}),
    ...(handoff.relevantFiles !== undefined ? { relevantFiles: handoff.relevantFiles } : {}),
    ...(handoff.changedFiles !== undefined ? { changedFiles: handoff.changedFiles } : {}),
    ...(handoff.failedApproaches !== undefined
      ? { failedApproaches: handoff.failedApproaches }
      : {}),
    ...(handoff.testState !== undefined ? { testState: handoff.testState } : {}),
    ...(handoff.verification !== undefined ? { verification: handoff.verification } : {}),
    ...(handoff.readYields !== undefined ? { readYields: handoff.readYields } : {}),
    ...(handoff.unresolved !== undefined ? { unresolved: handoff.unresolved } : {}),
    ...(handoff.evidence !== undefined ? { evidence: handoff.evidence } : {}),
  },
  // Truncation is explicit: budget.limits exposes the caps and
  // budget.omittedItems/omittedChars/truncatedItems count what was hidden.
  ...(handoff.budget !== undefined ? { budget: handoff.budget } : {}),
  ...(handoff.evidenceRefs !== undefined ? { evidenceRefs: handoff.evidenceRefs } : {}),
  eventCounts: handoff.eventCounts,
  diagnosticCodes: handoff.diagnosticCodes,
  provenance: handoff.provenance,
});

const writeHandoffFile = (
  home: string,
  workId: string,
  markdown: string,
  target: HandoffTarget,
  checkpointId?: string,
): string => {
  const directory = join(home, "handoffs");
  // Handoff artifacts carry session content, so create-time modes must be
  // private regardless of umask: directory 0700, artifact 0600. The tighten
  // pass on store open (enforceHandoffArtifactPermissions) stays as a
  // convergence backstop for artifacts written by older versions.
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const suffix =
    target === "pi" ? ".pi.md" : target === "codex" ? ".codex.md" : target === "grok" ? ".grok.md" : ".md";
  const checkpointSuffix = checkpointId === undefined ? "" : `.${safeWorkId(checkpointId)}`;
  const path = join(directory, `${safeWorkId(workId)}${checkpointSuffix}${suffix}`);
  writeFileSync(path, markdown, { mode: 0o600 });
  return path;
};

const safeWorkId = (workId: string): string => {
  const safe = workId.replace(/[^A-Za-z0-9._-]+/g, "_");
  return safe === "" ? "work" : safe;
};
