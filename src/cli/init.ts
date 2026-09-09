import { databasePath, initHarnieStore, resolveHarnieHome } from "../store/database.js";
import { FlagParseError, parseFlags } from "../contract/flags.js";

export interface RunInitOptions {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

const usage = "Usage: harnie init\n";

export const runInit = async (argv: readonly string[], options: RunInitOptions): Promise<number> => {
  try {
    const parsed = parseFlags(argv, {});
    if (parsed.positionals.length > 0) {
      options.stderr.write(usage);
      return 1;
    }
  } catch (error) {
    if (error instanceof FlagParseError) {
      options.stderr.write(`${error.message}\n${usage}`);
      return 1;
    }
    throw error;
  }
  try {
    const home = resolveHarnieHome(options.home ?? process.env.HARNIE_HOME);
    const store = initHarnieStore({ home });
    store.close();
    options.stdout.write(`Initialized Harnie.\n\nStore\n${databasePath(home)}\n`);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.stderr.write(`${message}\n`);
    return 1;
  }
};
