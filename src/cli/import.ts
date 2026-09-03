import { importPiSessionFile } from "../engine/import.js";
import { initHarnieStore, resolveHarnieHome } from "../store/database.js";

export interface RunImportOptions {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

const usage = "Usage: harnie import pi <path>\n";

export const runImport = async (argv: string[], options: RunImportOptions): Promise<number> => {
  const harness = argv[0];
  const path = argv[1];

  if (harness === undefined || harness === "") {
    options.stderr.write(usage);
    return 1;
  }

  if (harness !== "pi") {
    options.stderr.write(`Harness "${harness}" is not implemented.\n`);
    return 1;
  }

  if (path === undefined || path === "") {
    options.stderr.write(usage);
    return 1;
  }

  try {
    const home = resolveHarnieHome(options.home ?? process.env.HARNIE_HOME);
    const store = initHarnieStore({ home });
    try {
      const result = await importPiSessionFile(store, path);
      options.stdout.write(
        `Imported pi session.\n\nWork\n${result.workId}\nEvents inserted\n${result.eventsInserted}\n`,
      );
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
