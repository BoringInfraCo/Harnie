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

export const runExecutions = async (argv: string[], options: CliIo): Promise<number> => {
  // JSON mode is decided by the presence of --json so that a failure early in
  // parsing (unknown flag, duplicate flag) still produces a JSON envelope.
  const json = argv.includes("--json");
  try {
    const parsed = parseFlags(argv, { "--json": { kind: "switch" } });
    if (parsed.positionals.length === 0 || parsed.positionals[0] === "") {
      return fail(options, json, "missing_argument", "Work id is required.");
    }
    if (parsed.positionals.length > 1) {
      return fail(options, json, "usage", "harnie executions takes exactly one work id.");
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
        if (json) {
          return emitJsonSuccess(options.stdout, "executions", buildExecutionsData(work));
        }
        options.stdout.write(formatExecutions(work));
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
  if (json) return emitJsonFailure(options.stdout, "executions", code, message);
  options.stderr.write(`${message}\n`);
  return 1;
};

const buildExecutionsData = (work: Work) => ({
  workId: work.id,
  executions: work.executions.map((execution) => {
    const counts = executionEventCounts(work, execution.id);
    return {
      id: execution.id,
      harness: execution.harness,
      ...(execution.provider !== undefined ? { provider: execution.provider } : {}),
      ...(execution.model !== undefined ? { model: execution.model } : {}),
      sourceSessionId: execution.sourceSession.sourceId,
      ...(execution.sourceSession.sourceFormat !== undefined
        ? { sourceFormat: execution.sourceSession.sourceFormat }
        : {}),
      ...(execution.startedAt !== undefined ? { startedAt: execution.startedAt } : {}),
      eventCounts: counts,
      eventCount:
        counts.message + counts.tool_call + counts.tool_result + counts.command + counts.unknown,
    };
  }),
});

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
