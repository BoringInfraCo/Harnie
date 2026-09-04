import { listCheckpoints } from "../store/checkpoints.js";
import { initHarnieStore, resolveHarnieHome } from "../store/database.js";
import { loadWork } from "../store/persist.js";
import type { NormalizedEventKind } from "../types.js";
import { buildHandoffFromWork } from "../work/handoff.js";
import type { Execution, Work } from "../work/types.js";

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
  const workId = argv[0];
  if (workId === undefined || workId === "") {
    options.stderr.write("Work id is required.\n");
    return 1;
  }

  try {
    const home = resolveHarnieHome(options.home ?? process.env.HARNIE_HOME);
    const store = initHarnieStore({ home });
    try {
      const work = loadWork(store, workId);
      if (work === undefined) {
        options.stderr.write(`Work not found: ${workId}\n`);
        return 1;
      }
      const checkpoints = listCheckpoints(store, work.id);
      const composed: Work = checkpoints.length > 0 ? { ...work, checkpoints } : work;
      options.stdout.write(formatShow(composed));
      return 0;
    } finally {
      store.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.stderr.write(`${message}\n`);
    return 1;
  }
};

const formatShow = (work: Work): string => {
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

  const findings = bulletSection(work.findings, (finding) => finding.statement);
  if (findings) {
    sections.push(`Findings\n${findings}`);
  }

  const nextSteps = bulletSection(work.nextSteps, (step) => step.description);
  if (nextSteps) {
    sections.push(`Next\n${nextSteps}`);
  }

  const handoff = buildHandoffFromWork(work);
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

  const readYields = bulletSection(handoff.readYields, (line) => line);
  if (readYields) {
    sections.push(`Read yields\n${readYields}`);
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
