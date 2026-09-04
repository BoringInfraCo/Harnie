import { initHarnieStore, resolveHarnieHome } from "../store/database.js";
import { loadWork } from "../store/persist.js";
import { executionEventCounts } from "../work/diff.js";
import type { Work } from "../work/types.js";

export interface CliIo {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

export const runExecutions = async (argv: string[], options: CliIo): Promise<number> => {
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
      options.stdout.write(formatExecutions(work));
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

const formatExecutions = (work: Work): string => {
  const lines = work.executions.map((execution) => {
    const counts = executionEventCounts(work, execution.id);
    const total =
      counts.message + counts.tool_call + counts.tool_result + counts.command + counts.unknown;
    const harnessPart = execution.model ? `${execution.harness} / ${execution.model}` : execution.harness;
    const base =
      `${execution.id}  ${harnessPart}  session ${execution.sourceSession.sourceId}` +
      `  events ${total} (message ${counts.message}, tool_call ${counts.tool_call}, tool_result ${counts.tool_result}, command ${counts.command}, unknown ${counts.unknown})`;
    return execution.startedAt ? `${base}  started ${execution.startedAt}` : base;
  });
  if (lines.length === 0) {
    return `Work\n${work.id}\n\nExecutions\n`;
  }
  return `Work\n${work.id}\n\nExecutions\n${lines.join("\n")}\n`;
};
