import { backupHarnieStore, restoreHarnieStore } from "../store/backup.js";
import { resolveHarnieHome } from "../store/database.js";
import { FlagParseError, parseFlags } from "../contract/flags.js";

export interface RunBackupOptions {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

const backupUsage = "Usage: harnie backup <dest-path>\n";
const restoreUsage = "Usage: harnie restore <src-path> [--force]\n";

export const runBackup = async (argv: string[], options: RunBackupOptions): Promise<number> => {
  try {
    const parsed = parseFlags(argv, {
      "--help": { kind: "switch" },
      "-h": { kind: "switch" },
    });
    if (parsed.switches["--help"] === true || parsed.switches["-h"] === true) {
      options.stdout.write(backupUsage);
      return 0;
    }
    const dest = parsed.positionals[0];
    if (dest === undefined || dest === "" || parsed.positionals.length > 1) {
      options.stderr.write(backupUsage);
      return 1;
    }
    try {
      const home = resolveHarnieHome(options.home ?? process.env.HARNIE_HOME);
      const written = backupHarnieStore(home, dest);
      options.stdout.write(`Backup\n${written}\n`);
      return 0;
    } catch (error) {
      options.stderr.write(`${messageOf(error)}\n`);
      return 1;
    }
  } catch (error) {
    if (error instanceof FlagParseError) {
      options.stderr.write(`${error.message}\n${backupUsage}`);
      return 1;
    }
    throw error;
  }
};

export const runRestore = async (argv: string[], options: RunBackupOptions): Promise<number> => {
  try {
    const parsed = parseFlags(argv, {
      "--force": { kind: "switch" },
      "--help": { kind: "switch" },
      "-h": { kind: "switch" },
    });
    if (parsed.switches["--help"] === true || parsed.switches["-h"] === true) {
      options.stdout.write(restoreUsage);
      return 0;
    }
    const src = parsed.positionals[0];
    if (src === undefined || src === "" || parsed.positionals.length > 1) {
      options.stderr.write(restoreUsage);
      return 1;
    }
    const force = parsed.switches["--force"] === true;
    const home = resolveHarnieHome(options.home ?? process.env.HARNIE_HOME);
    const restored = restoreHarnieStore(home, src, force ? { force: true } : {});
    options.stdout.write(`Restored\n${restored}\n\nFrom\n${src}\n`);
    return 0;
  } catch (error) {
    if (error instanceof FlagParseError) {
      options.stderr.write(`${error.message}\n${restoreUsage}`);
      return 1;
    }
    options.stderr.write(`${messageOf(error)}\n`);
    return 1;
  }
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
