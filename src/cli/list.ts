import { initHarnieStore, resolveHarnieHome } from "../store/database.js";
import { listWorks, type WorkSummary } from "../store/query.js";

export interface CliIo {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

export const runList = async (options: CliIo): Promise<number> => {
  try {
    const home = resolveHarnieHome(options.home ?? process.env.HARNIE_HOME);
    const store = initHarnieStore({ home });
    try {
      const works = listWorks(store);
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
