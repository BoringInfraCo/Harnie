import { initHarnieStore, resolveHarnieHome } from "../store/database.js";
import { loadWork } from "../store/persist.js";
import { executionEventCounts } from "../work/diff.js";
import type { Work } from "../work/types.js";

export interface CliIo {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

export const runHistory = async (argv: string[], options: CliIo): Promise<number> => {
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
      options.stdout.write(formatHistory(work));
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

const formatHistory = (work: Work): string => {
  const sections: string[] = [`Work\n${work.id}`];
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
