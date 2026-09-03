import { databasePath, initHarnieStore, resolveHarnieHome } from "../store/database.js";

export interface RunInitOptions {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

export const runInit = async (options: RunInitOptions): Promise<number> => {
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
