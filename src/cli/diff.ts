import { initHarnieStore, resolveHarnieHome } from "../store/database.js";
import { loadWork } from "../store/persist.js";
import { diffExecutions } from "../work/diff.js";
import { classifyErrorText, type CliErrorCode } from "../contract/errors.js";
import { emitJsonFailure, emitJsonSuccess } from "../contract/envelope.js";
import { FlagParseError, parseFlags } from "../contract/flags.js";

export interface CliIo {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

const usage = "Usage: harnie diff <work> <execution-a> <execution-b>\n";

const EVENT_KINDS = ["message", "tool_call", "tool_result", "command", "unknown"] as const;

export const runDiff = async (argv: string[], options: CliIo): Promise<number> => {
  // JSON mode is decided by the presence of --json so that a failure early in
  // parsing (unknown flag, duplicate flag) still produces a JSON envelope.
  const json = argv.includes("--json");
  try {
    const parsed = parseFlags(argv, { "--json": { kind: "switch" } });
    if (parsed.positionals.length < 3 || parsed.positionals.some((arg) => arg === "")) {
      return fail(options, json, "missing_argument", usage.trimEnd());
    }    if (parsed.positionals.length > 3) {
      return fail(options, json, "usage", "harnie diff takes exactly three arguments.");
    }
    const [workId, fromId, toId] = parsed.positionals;

    try {
      const home = resolveHarnieHome(options.home ?? process.env.HARNIE_HOME);
      const store = initHarnieStore({ home });
      try {
        const work = loadWork(store, workId ?? "");
        if (work === undefined) {
          return fail(options, json, "not_found", `Work not found: ${workId}`);
        }
        const diff = diffExecutions(work, fromId ?? "", toId ?? "");
        if (json) {
          return emitJsonSuccess(options.stdout, "diff", {
            workId: diff.workId,
            fromId: diff.fromId,
            toId: diff.toId,
            fromCounts: diff.fromCounts,
            toCounts: diff.toCounts,
            decisions: diffGroup(diff.keptDecisions, diff.addedDecisions, diff.removedDecisions),
            findings: diffGroup(diff.keptFindings, diff.addedFindings, diff.removedFindings),
            nextSteps: diffGroup(diff.keptNextSteps, diff.addedNextSteps, diff.removedNextSteps),
            operations: diffGroup(diff.keptOperations, diff.addedOperations, diff.removedOperations),
          });
        }
        options.stdout.write(formatDiff(diff));
        return 0;
      } finally {
        store.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(options, json, classifyErrorText(message), message);
    }
  } catch (error) {
    if (error instanceof FlagParseError) {
      return fail(options, json, error.code, error.message);
    }
    throw error;
  }
};

const fail = (options: CliIo, json: boolean, code: CliErrorCode, message: string): number => {
  if (json) return emitJsonFailure(options.stdout, "diff", code, message);
  options.stderr.write(`${message}\n`);
  return 1;
};

const diffGroup = (
  kept: readonly string[],
  added: readonly string[],
  removed: readonly string[],
) => ({ kept, added, removed });

interface DiffLike {
  readonly workId: string;
  readonly fromId: string;
  readonly toId: string;
  readonly fromCounts: Record<(typeof EVENT_KINDS)[number], number>;
  readonly toCounts: Record<(typeof EVENT_KINDS)[number], number>;
  readonly keptDecisions: readonly unknown[];
  readonly addedDecisions: readonly unknown[];
  readonly removedDecisions: readonly unknown[];
  readonly keptFindings: readonly unknown[];
  readonly addedFindings: readonly unknown[];
  readonly removedFindings: readonly unknown[];
  readonly keptNextSteps: readonly unknown[];
  readonly addedNextSteps: readonly unknown[];
  readonly removedNextSteps: readonly unknown[];
  readonly keptOperations: readonly unknown[];
  readonly addedOperations: readonly unknown[];
  readonly removedOperations: readonly unknown[];
}

const formatDiff = (diff: DiffLike): string => {
  const sections: string[] = [`Diff\n${diff.workId}  ${diff.fromId} → ${diff.toId}`];
  const eventLines = EVENT_KINDS.map(
    (kind) => `${kind} ${diff.fromCounts[kind]} → ${diff.toCounts[kind]}`,
  );
  sections.push(`Events\n${eventLines.join("\n")}`);
  const groups: ReadonlyArray<{ header: string; added: readonly unknown[]; kept: readonly unknown[]; removed: readonly unknown[] }> = [
    { header: "Decisions", added: diff.addedDecisions, kept: diff.keptDecisions, removed: diff.removedDecisions },
    { header: "Findings", added: diff.addedFindings, kept: diff.keptFindings, removed: diff.removedFindings },
    { header: "Next steps", added: diff.addedNextSteps, kept: diff.keptNextSteps, removed: diff.removedNextSteps },
    { header: "Operations", added: diff.addedOperations, kept: diff.keptOperations, removed: diff.removedOperations },
  ];
  for (const group of groups) {
    const lines: string[] = [];
    for (const item of group.added) {
      const text = diffText(item);
      if (text !== "") lines.push(`+ ${text}`);
    }
    for (const item of group.kept) {
      const text = diffText(item);
      if (text !== "") lines.push(`= ${text}`);
    }
    for (const item of group.removed) {
      const text = diffText(item);
      if (text !== "") lines.push(`- ${text}`);
    }
    if (lines.length > 0) {
      sections.push(`${group.header}\n${lines.join("\n")}`);
    }
  }
  return `${sections.join("\n\n")}\n`;
};

const diffText = (item: unknown): string => {
  if (typeof item === "string") return item;
  if (item !== null && typeof item === "object") {
    const record = item as Record<string, unknown>;
    const summary = record.summary;
    if (typeof summary === "string" && summary.length > 0) return summary;
    const statement = record.statement;
    if (typeof statement === "string" && statement.length > 0) return statement;
    const description = record.description;
    if (typeof description === "string" && description.length > 0) return description;
    const text = record.text;
    if (typeof text === "string" && text.length > 0) return text;
    const toolName = typeof record.toolName === "string" ? record.toolName : undefined;
    const path = typeof record.path === "string" ? record.path : undefined;
    const command = typeof record.command === "string" ? record.command : undefined;
    const status = typeof record.status === "string" ? record.status : undefined;
    const detail = path ?? command ?? "";
    const head = [toolName, detail].filter((part): part is string => typeof part === "string" && part.length > 0).join(" ");
    if (head.length > 0) return status ? `${head} — ${status}` : head;
    if (status) return status;
  }
  return "";
};
