import { emitJsonFailure, emitJsonSuccess } from "../contract/envelope.js";
import { FlagParseError, parseFlags } from "../contract/flags.js";
import { classifyErrorText } from "../contract/errors.js";
import { initHarnieStore, resolveHarnieHome } from "../store/database.js";
import { listWorks, type WorkSummary } from "../store/query.js";

export interface CliIo {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

const usage = "Usage: harnie list [--json]\n";

const listData = (works: readonly WorkSummary[]) => ({
  works: works.map((work) => ({
    id: work.id,
    ...(work.workspacePath !== undefined ? { workspacePath: work.workspacePath } : {}),
    ...(work.harness !== undefined ? { harness: work.harness } : {}),
    ...(work.provider !== undefined ? { provider: work.provider } : {}),
    ...(work.model !== undefined ? { model: work.model } : {}),
    ...(work.updatedAt !== undefined ? { updatedAt: work.updatedAt } : {}),
    eventCount: work.eventCount,
  })),
});

export const runList = async (argv: readonly string[], options: CliIo): Promise<number> => {
  // JSON mode is decided by the presence of --json so that a failure early in
  // parsing (unknown flag, duplicate flag) still produces a JSON envelope.
  const json = argv.includes("--json");
  try {
    const parsed = parseFlags(argv, { "--json": { kind: "switch" } });
    if (parsed.positionals.length > 0) {
      const message = "Usage: harnie list [--json]\nharnie list takes no positional arguments.";
      if (json) return emitJsonFailure(options.stdout, "list", "usage", message);
      options.stderr.write(usage);
      return 1;
    }
  } catch (error) {
    if (error instanceof FlagParseError) {
      if (json) return emitJsonFailure(options.stdout, "list", error.code, error.message);
      options.stderr.write(`${error.message}\n${usage}`);
      return 1;
    }
    throw error;
  }
  try {
    const home = resolveHarnieHome(options.home ?? process.env.HARNIE_HOME);
    const store = initHarnieStore({ home });
    try {
      const works = listWorks(store);
      if (json) return emitJsonSuccess(options.stdout, "list", listData(works));
      if (works.length === 0) {
        options.stdout.write("No observed work.\n");
        return 0;
      }
      options.stdout.write(formatList(works));
      return 0;
    } finally {
      store.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) return emitJsonFailure(options.stdout, "list", classifyErrorText(message), message);
    options.stderr.write(`${message}\n`);
    return 1;
  }
};

const formatList = (works: readonly WorkSummary[]): string => {
  const header = ["WORK", "WORKSPACE", "HARNESS", "UPDATED"] as const;
  const rows = works.map(listRow);
  const widths = header.map((title, index) =>
    Math.max(title.length, ...rows.map((row) => (row[index] ?? "").length)),
  );
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? 0))
      .join("  ")
      .trimEnd();
  return `${[line(header), ...rows.map(line)].join("\n")}\n`;
};

const listRow = (work: WorkSummary): readonly [string, string, string, string] => [
  work.id,
  work.workspacePath ?? "-",
  work.harness ?? "-",
  work.updatedAt ?? "-",
];
