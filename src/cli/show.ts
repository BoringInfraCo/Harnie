import { listCheckpoints } from "../store/checkpoints.js";
import { initHarnieStore, resolveHarnieHome } from "../store/database.js";
import { loadWork } from "../store/persist.js";
import type { NormalizedEventKind } from "../types.js";
import { buildHandoffFromWork, applyOutputRedaction, redactOutputText } from "../work/handoff.js";
import type { Execution, Work } from "../work/types.js";
import { classifyErrorText, type CliErrorCode } from "../contract/errors.js";
import { emitJsonFailure, emitJsonSuccess } from "../contract/envelope.js";
import { FlagParseError, parseFlags } from "../contract/flags.js";

export interface CliIo {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

const EVENT_KINDS: readonly NormalizedEventKind[] = [
  "message",
  "tool_call",
  "tool_result",
  "command",
  "unknown",
];

export const runShow = async (argv: string[], options: CliIo): Promise<number> => {
  // JSON mode is decided by the presence of --json so that a failure early in
  // parsing (unknown flag, duplicate flag) still produces a JSON envelope.
  const json = argv.includes("--json");
  try {
    const parsed = parseFlags(argv, { "--json": { kind: "switch" } });
    if (parsed.positionals.length === 0 || parsed.positionals[0] === "") {
      return fail(options, json, "missing_argument", "Work id is required.");
    }
    if (parsed.positionals.length > 1) {
      return fail(options, json, "usage", "harnie show takes exactly one work id.");
    }
    const workId = parsed.positionals[0] ?? "";

    try {
      const home = resolveHarnieHome(options.home ?? process.env.HARNIE_HOME);
      const store = initHarnieStore({ home });
      try {
        const work = loadWork(store, workId);
        if (work === undefined) {
          return fail(options, json, "not_found", `Work not found: ${workId}`);
        }
        const checkpoints = listCheckpoints(store, work.id);
        const composed: Work = checkpoints.length > 0 ? { ...work, checkpoints } : work;
        if (json) {
          return emitJsonSuccess(options.stdout, "show", buildShowData(composed));
        }
        // Final output pass: show renders some Work fields directly (not via
        // the redacted handoff builder), so redact here for legacy stores.
        options.stdout.write(applyOutputRedaction(formatShow(composed)));
        return 0;
      } finally {
        store.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(options, json, classifyErrorText(message), message);
    }
  } catch (error) {
    if (error instanceof FlagParseError) {
      return fail(options, json, error.code, error.message);
    }
    throw error;
  }
};

const fail = (options: CliIo, json: boolean, code: CliErrorCode, message: string): number => {
  if (json) return emitJsonFailure(options.stdout, "show", code, message);
  options.stderr.write(`${message}\n`);
  return 1;
};

const buildShowData = (work: Work) => {
  const handoff = buildHandoffFromWork(work);
  let redactions = 0;
  const redact = (value: string): string => {
    const result = redactOutputText(value);
    redactions += result.redactions;
    return result.text;
  };
  const data = {
    work: {
      id: work.id,
      ...(work.createdAt !== undefined ? { createdAt: work.createdAt } : {}),
      ...(work.updatedAt !== undefined ? { updatedAt: work.updatedAt } : {}),
      ...(work.workspace !== undefined ? { workspacePath: redact(work.workspace.path) } : {}),
      ...(work.forkedFrom !== undefined
        ? {
            forkedFrom: {
              workId: work.forkedFrom.workId,
              ...(work.forkedFrom.checkpointId !== undefined
                ? { checkpointId: work.forkedFrom.checkpointId }
                : {}),
              ...(work.forkedFrom.message !== undefined
                ? { message: redact(work.forkedFrom.message) }
                : {}),
            },
          }
        : {}),
      executions: work.executions.map((execution) => ({
        id: execution.id,
        harness: execution.harness,
        ...(execution.provider !== undefined ? { provider: execution.provider } : {}),
        ...(execution.model !== undefined ? { model: execution.model } : {}),
        sourceSession: {
          sourceId: execution.sourceSession.sourceId,
          ...(execution.sourceSession.sourceFormat !== undefined
            ? { sourceFormat: execution.sourceSession.sourceFormat }
            : {}),
        },
        ...(execution.startedAt !== undefined ? { startedAt: execution.startedAt } : {}),
      })),
      ...(work.goal !== undefined
        ? {
            goal: {
              statement: redact(work.goal.statement),
              evidence: work.goal.evidence,
              rule: work.goal.rule,
            },
          }
        : {}),
      decisions: (work.decisions ?? []).map((decision) => ({
        id: decision.id,
        summary: redact(decision.summary),
        evidence: decision.evidence,
      })),
      findings: (work.findings ?? []).map((finding) => ({
        id: finding.id,
        statement: redact(finding.statement),
        evidence: finding.evidence,
      })),
      nextSteps: (work.nextSteps ?? []).map((step) => ({
        id: step.id,
        description: redact(step.description),
        evidence: step.evidence,
      })),
      ...(work.operations !== undefined && work.operations.length > 0
        ? { operations: work.operations.map(toOperationData) }
        : {}),
    },
    derived: {
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
      // Truncation is explicit: budget.limits exposes the caps and
      // budget.omittedItems/omittedChars/truncatedItems count what was hidden.
      ...(handoff.budget !== undefined ? { budget: handoff.budget } : {}),
      ...(handoff.evidenceRefs !== undefined ? { evidenceRefs: handoff.evidenceRefs } : {}),
    },
    checkpoints: (work.checkpoints ?? []).map((checkpoint) => ({
      id: checkpoint.id,
      ...(checkpoint.executionId !== undefined ? { executionId: checkpoint.executionId } : {}),
      message: redact(checkpoint.message),
      createdAt: checkpoint.createdAt,
      eventCount: checkpoint.eventCount,
    })),
    eventCounts: handoff.eventCounts,
    diagnosticCodes: handoff.diagnosticCodes,
    redactions,
    provenance: "observed" as const,
  };
  return data;
};

type WorkOperation = NonNullable<Work["operations"]>[number];

const toOperationData = (operation: WorkOperation) => ({
  ...(operation.toolName !== undefined ? { toolName: operation.toolName } : {}),
  ...(operation.path !== undefined ? { path: operation.path } : {}),
  ...(operation.command !== undefined ? { command: operation.command } : {}),
  status: operation.status,
  ...(operation.note !== undefined ? { note: operation.note } : {}),
  evidence: operation.evidence,
});

const formatShow = (work: Work): string => {
  const handoff = buildHandoffFromWork(work);
  const sections: string[] = [`Work\n${work.id}`];

  if (work.forkedFrom) {
    sections.push(
      `Forked from\n${work.forkedFrom.workId} @ ${work.forkedFrom.checkpointId ?? "none"} — "${work.forkedFrom.message ?? ""}"`,
    );
  }

  if (work.workspace) {
    sections.push(`Workspace\n${work.workspace.path}`);
  }

  const executionLines = work.executions.flatMap(formatExecution);
  if (executionLines.length > 0) {
    sections.push(`Execution\n${executionLines.join("\n")}`);
  }

  const goal = work.goal?.statement;
  if (goal) {
    sections.push(`Goal\n${goal}`);
  }

  const decisions = bulletSection(work.decisions, (decision) => decision.summary);
  if (decisions) {
    sections.push(`Decisions\n${decisions}`);
  }

  const findings = bulletSection(handoff.findings, (finding) => finding);
  if (findings) {
    sections.push(`Findings\n${findings}`);
  }

  const nextSteps = bulletSection(handoff.nextSteps, (step) => step);
  if (nextSteps) {
    sections.push(`Next\n${nextSteps}`);
  }

  const operations = handoff.operations.map((line) => `• ${line}`);
  if (operations.length > 0) {
    sections.push(`Operations\n${operations.join("\n")}`);
  }

  if (handoff.revision) {
    sections.push(`Repository\n${handoff.revision}`);
  }

  const relevantFiles = bulletSection(handoff.relevantFiles, (path) => path);
  if (relevantFiles) {
    sections.push(`Relevant files\n${relevantFiles}`);
  }

  const changedFiles = bulletSection(handoff.changedFiles, (path) => path);
  if (changedFiles) {
    sections.push(`Changed files\n${changedFiles}`);
  }

  const failedApproaches = bulletSection(handoff.failedApproaches, (line) => line);
  if (failedApproaches) {
    sections.push(`Failed approaches\n${failedApproaches}`);
  }

  if (handoff.testState) {
    sections.push(`Test state\n${handoff.testState}`);
  }

  if (handoff.verification) {
    sections.push(`Verification\n${handoff.verification}`);
  }

  const readYields = bulletSection(handoff.readYields, (line) => line);
  if (readYields) {
    sections.push(`Read yields\n${readYields}`);
  }

  if (handoff.unresolved) {
    sections.push(`Unresolved\n${handoff.unresolved}`);
  }

  const evidence = bulletSection(handoff.evidence, (id) => id);
  if (evidence) {
    sections.push(`Evidence\n${evidence}`);
  }

  if (work.checkpoints !== undefined && work.checkpoints.length > 0) {
    const lines = work.checkpoints.map((checkpoint) => {
      const message = checkpoint.message === "" ? "(no message)" : checkpoint.message;
      return `• ${checkpoint.id} ${checkpoint.createdAt} — ${message} (${checkpoint.eventCount} events)`;
    });
    sections.push(`Checkpoints\n${lines.join("\n")}`);
  }

  sections.push(`Events\n${EVENT_KINDS.map((kind) => `${kind} ${countKind(work, kind)}`).join("\n")}`);

  const codes = uniqueDiagnosticCodes(work);
  if (codes.length > 0) {
    sections.push(`Diagnostics\n${codes.join("\n")}`);
  }

  sections.push("Provenance\nobserved");
  return `${sections.join("\n\n")}\n`;
};

const bulletSection = <T>(
  items: readonly T[] | undefined,
  text: (item: T) => string | undefined,
): string | undefined => {
  if (items === undefined || items.length === 0) return undefined;
  const lines = items.flatMap((item) => {
    const value = text(item);
    return value ? [`• ${value}`] : [];
  });
  return lines.length > 0 ? lines.join("\n") : undefined;
};

const formatExecution = (execution: Execution): readonly string[] => {
  const identity = [execution.harness];
  if (execution.provider) identity.push(execution.provider);
  if (execution.model) identity.push(execution.model);
  const lines = [identity.join(" / ")];
  if (execution.sourceSession.sourceFormat) {
    lines.push(execution.sourceSession.sourceFormat);
  }
  lines.push(execution.sourceSession.sourceId);
  return lines;
};

const countKind = (work: Work, kind: NormalizedEventKind): number =>
  work.events.filter((event) => event.kind === kind).length;

const uniqueDiagnosticCodes = (work: Work): readonly string[] => {
  const codes = new Set<string>();
  for (const diagnostic of work.diagnostics) {
    codes.add(diagnostic.code);
  }
  for (const event of work.events) {
    for (const diagnostic of event.diagnostics) {
      codes.add(diagnostic.code);
    }
  }
  return [...codes];
};
