import { initHarnieStore, resolveHarnieHome } from "../store/database.js";
import { createCheckpoint } from "../store/checkpoints.js";
import { FlagParseError, parseFlags } from "../contract/flags.js";

export interface CliIo {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

export const runCheckpoint = async (argv: string[], options: CliIo): Promise<number> => {
  let positional: readonly string[];
  try {
    positional = parseFlags(argv, {}).positionals;
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
      const checkpoint = createCheckpoint(store, workId, message);
      const display = checkpoint.message === "" ? "(no message)" : checkpoint.message;
      options.stdout.write(`Checkpoint\n${checkpoint.id}\n\nWork\n${checkpoint.workId}\n\nMessage\n${display}\n`);
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
