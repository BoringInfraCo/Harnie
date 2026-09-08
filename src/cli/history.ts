import { listCheckpoints } from "../store/checkpoints.js";
import { initHarnieStore, resolveHarnieHome } from "../store/database.js";
import { loadWork } from "../store/persist.js";
import { executionEventCounts } from "../work/diff.js";
import type { Work } from "../work/types.js";
import { classifyErrorText, type CliErrorCode } from "../contract/errors.js";
import { emitJsonFailure, emitJsonSuccess } from "../contract/envelope.js";
import { FlagParseError, parseFlags } from "../contract/flags.js";

export interface CliIo {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

export const runHistory = async (argv: string[], options: CliIo): Promise<number> => {
  // JSON mode is decided by the presence of --json so that a failure early in
  // parsing (unknown flag, duplicate flag) still produces a JSON envelope.
  const json = argv.includes("--json");
  try {
    const parsed = parseFlags(argv, { "--json": { kind: "switch" } });
    if (parsed.positionals.length === 0 || parsed.positionals[0] === "") {
      return fail(options, json, "missing_argument", "Work id is required.");
    }
    if (parsed.positionals.length > 1) {
      return fail(options, json, "usage", "harnie history takes exactly one work id.");
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
          return emitJsonSuccess(options.stdout, "history", buildHistoryData(composed));
        }
        options.stdout.write(formatHistory(composed));
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
  if (json) return emitJsonFailure(options.stdout, "history", code, message);
  options.stderr.write(`${message}\n`);
  return 1;
};

const buildHistoryData = (work: Work) => ({
  workId: work.id,
  ...(work.forkedFrom !== undefined
    ? {
        forkedFrom: {
          workId: work.forkedFrom.workId,
          ...(work.forkedFrom.checkpointId !== undefined
            ? { checkpointId: work.forkedFrom.checkpointId }
            : {}),
          ...(work.forkedFrom.message !== undefined ? { message: work.forkedFrom.message } : {}),
        },
      }
    : {}),
  ...(work.workspace !== undefined ? { workspacePath: work.workspace.path } : {}),
  ...(work.goal?.statement ? { goal: work.goal.statement } : {}),
  executions: work.executions.map((execution) => ({
    id: execution.id,
    harness: execution.harness,
    ...(execution.provider !== undefined ? { provider: execution.provider } : {}),
    ...(execution.model !== undefined ? { model: execution.model } : {}),
    sourceSessionId: execution.sourceSession.sourceId,
    ...(execution.startedAt !== undefined ? { startedAt: execution.startedAt } : {}),
    eventCounts: executionEventCounts(work, execution.id),
  })),
  checkpoints: (work.checkpoints ?? []).map((checkpoint) => ({
    id: checkpoint.id,
    ...(checkpoint.executionId !== undefined ? { executionId: checkpoint.executionId } : {}),
    message: checkpoint.message,
    createdAt: checkpoint.createdAt,
    eventCount: checkpoint.eventCount,
  })),
  decisions: (work.decisions ?? [])
    .map((decision) => decision.summary)
    .filter((summary) => summary.length > 0),
  findings: (work.findings ?? [])
    .map((finding) => finding.statement)
    .filter((statement) => statement.length > 0),
  nextSteps: (work.nextSteps ?? [])
    .map((step) => step.description)
    .filter((description) => description.length > 0),
});

const formatHistory = (work: Work): string => {
  const sections: string[] = [`Work\n${work.id}`];
  if (work.forkedFrom) {
    sections.push(
      `Forked from\n${work.forkedFrom.workId} @ ${work.forkedFrom.checkpointId ?? "none"} — "${work.forkedFrom.message ?? ""}"`,
    );
  }
  if (work.workspace) {
    sections.push(`Workspace\n${work.workspace.path}`);
  }
  if (work.goal?.statement) {
    sections.push(`Goal\n${work.goal.statement}`);
  }
  const blocks = work.executions.map((execution) => {
    const counts = executionEventCounts(work, execution.id);
    const harnessPart = execution.model ? `${execution.harness} / ${execution.model}` : execution.harness;
    const sessionLine = execution.startedAt
      ? `Session ${execution.sourceSession.sourceId}  Started ${execution.startedAt}`
      : `Session ${execution.sourceSession.sourceId}`;
    return (
      `## ${harnessPart} — ${execution.id}\n${sessionLine}\n` +
      `Events message ${counts.message}, tool_call ${counts.tool_call}, tool_result ${counts.tool_result}, command ${counts.command}, unknown ${counts.unknown}`
    );
  });
  sections.push(`History\n${blocks.join("\n")}`);
  if (work.checkpoints !== undefined && work.checkpoints.length > 0) {
    const lines = work.checkpoints.map(
      (checkpoint) =>
        `- ${checkpoint.createdAt} ${checkpoint.id} — ${checkpoint.message} [after ${checkpoint.executionId ?? "none"}, ${checkpoint.eventCount} events]`,
    );
    sections.push(`Checkpoints\n${lines.join("\n")}`);
  }
  const decisions = (work.decisions ?? [])
    .map((decision) => decision.summary)
    .filter((summary) => summary.length > 0);
  if (decisions.length > 0) {
    sections.push(`Decisions\n${decisions.map((summary) => `- ${summary}`).join("\n")}`);
  }
  const findings = (work.findings ?? [])
    .map((finding) => finding.statement)
    .filter((statement) => statement.length > 0);
  if (findings.length > 0) {
    sections.push(`Findings\n${findings.map((statement) => `- ${statement}`).join("\n")}`);
  }
  const nextSteps = (work.nextSteps ?? [])
    .map((step) => step.description)
    .filter((description) => description.length > 0);
  if (nextSteps.length > 0) {
    sections.push(`Next steps\n${nextSteps.map((description) => `- ${description}`).join("\n")}`);
  }
  return `${sections.join("\n\n")}\n`;
};
