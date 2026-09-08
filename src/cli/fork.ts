import { createFork } from "../store/fork.js";
import { initHarnieStore, resolveHarnieHome } from "../store/database.js";
import { FlagParseError, parseFlags } from "../contract/flags.js";

export interface CliIo {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

export const runFork = async (argv: string[], options: CliIo): Promise<number> => {
  let checkpointId: string | undefined;
  let positional: readonly string[];
  try {
    const parsed = parseFlags(argv, { "--checkpoint": { kind: "value" } });
    checkpointId = parsed.values["--checkpoint"];
    positional = parsed.positionals;
  } catch (error) {
    if (error instanceof FlagParseError) {
      options.stderr.write(`${error.message}\n`);
      return 1;
    }
    throw error;
  }
  const workId = positional[0];
  if (workId === undefined || workId === "") {
    options.stderr.write("Work id is required.\n");
    return 1;
  }
  const message = positional.slice(1).join(" ");

  try {
    const home = resolveHarnieHome(options.home ?? process.env.HARNIE_HOME);
    const store = initHarnieStore({ home });
    try {
      const result = createFork(
        store,
        workId,
        message,
        checkpointId === undefined || checkpointId === "" ? undefined : checkpointId,
      );
      const display = message === "" ? "(no message)" : message;
      options.stdout.write(`Fork\n${result.workId}\n\nForked from\n${workId} @ ${result.checkpointId} — "${display}"\n`);
      return 0;
    } finally {
      store.close();
    }
  } catch (error) {
    const text = error instanceof Error ? error.message : String(error);
    options.stderr.write(`${text}\n`);
    return 1;
  }
};
