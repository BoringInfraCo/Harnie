import {
  importCodexSessionFile,
  importOpenCodeSessionFile,
  importPiSessionFile,
} from "../engine/import.js";
import { initHarnieStore, resolveHarnieHome } from "../store/database.js";

export interface RunImportOptions {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

const usage =
  "Usage: harnie import pi <path> [--work <work>]\n       harnie import opencode <path> [--work <work>]\n       harnie import codex <path> [--work <work>]\n";

export const runImport = async (argv: string[], options: RunImportOptions): Promise<number> => {
  const args = nonFlagArgs(argv);
  const harness = args[0];
  const path = args[1];
  const workId = flagValue(argv, "--work");

  if (harness === undefined || harness === "") {
    options.stderr.write(usage);
    return 1;
  }

  if (harness !== "pi" && harness !== "opencode" && harness !== "codex") {
    options.stderr.write(`Harness "${harness}" is not implemented.\n`);
    return 1;
  }

  if (path === undefined || path === "") {
    options.stderr.write(usage);
    return 1;
  }

  if (workId !== undefined && workId === "") {
    options.stderr.write(usage);
    return 1;
  }

  if (workId === undefined && argv.includes("--work")) {
    options.stderr.write(usage);
    return 1;
  }

  try {
    const home = resolveHarnieHome(options.home ?? process.env.HARNIE_HOME);
    const store = initHarnieStore({ home });
    try {
      const attach = workId !== undefined ? { workId } : undefined;
      const result =
        harness === "codex"
          ? await importCodexSessionFile(store, path, attach)
          : harness === "opencode"
            ? await importOpenCodeSessionFile(store, path, attach)
            : await importPiSessionFile(store, path, attach);
      options.stdout.write(
        `Imported ${harness} session.\n\nWork\n${result.workId}\nEvents inserted\n${result.eventsInserted}\n`,
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

const nonFlagArgs = (argv: readonly string[]): string[] => {
  const args: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--work") {
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
