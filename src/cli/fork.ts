import { createFork } from "../store/fork.js";
import { initHarnieStore, resolveHarnieHome } from "../store/database.js";

export interface CliIo {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

export const runFork = async (argv: string[], options: CliIo): Promise<number> => {
  const checkpointId = flagValue(argv, "--checkpoint");
  const positional = nonFlagArgs(argv, "--checkpoint");
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

const nonFlagArgs = (argv: readonly string[], flag: string): string[] => {
  const args: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === flag) {
      index += 1;
      continue;
    }
    if (arg === undefined || arg.startsWith("-")) continue;
    args.push(arg);
  }
  return args;
};

const flagValue = (argv: readonly string[], flag: string): string | undefined => {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
};
