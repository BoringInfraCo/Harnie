import { extractToolOperations } from "./operations.js";
import type { Work } from "./types.js";

export interface ObservedContext {
  readonly revision?: string;
  readonly relevantFiles: readonly string[];
  readonly changedFiles: readonly string[];
  readonly failedApproaches: readonly string[];
  readonly testState?: string;
  readonly readYields: readonly string[];
}

const COMMAND_LIMIT = 40;
const GIT_COMMAND = /\bgit\s+(log|rev-parse|status)\b/i;
const GIT_SHA = /\b([0-9a-f]{7,40})\b/i;
const TEST_COMMAND = /\b(vitest|pytest|cargo\s+test|npm\s+test|pnpm\s+test|yarn\s+test)\b/i;
const GENERIC_LISTING = /^(?:ls|pwd)\b/i;
const READ_TOOLS = new Set(["read", "cat"]);
const CHANGED_TOOLS = new Set(["edit", "write", "apply_patch", "str_replace"]);

export const extractObservedContext = (work: Work): ObservedContext => {
  const operations = work.operations ?? extractToolOperations(work);
  const workspacePath = work.workspace?.path;
  const relevantFiles: string[] = [];
  const changedFiles: string[] = [];
  const failedApproaches: string[] = [];
  const readYields: string[] = [];
  const seenRelevant = new Set<string>();
  const seenChanged = new Set<string>();
  let revision: string | undefined;
  let testState: string | undefined;

  for (const operation of operations) {
    const toolName = present(operation.toolName);
    const path = isPresent(operation.path) ? displayPath(operation.path, workspacePath) : undefined;
    const command = isPresent(operation.command) ? displayCommand(operation.command, workspacePath) : undefined;
    const note = present(operation.note);
    const tool = toolName?.toLowerCase();

    if (operation.status === "succeeded" && command && GIT_COMMAND.test(command) && note) {
      const sha = note.match(GIT_SHA)?.[1];
      if (sha) revision = sha;
    }

    if (operation.status === "succeeded" && tool && READ_TOOLS.has(tool) && path) {
      pushUnique(relevantFiles, seenRelevant, path);
      if (note && !isGenericListing(toolName, command)) {
        readYields.push(`${path} — ${note}`);
      }
    }

    if (operation.status === "succeeded" && tool && CHANGED_TOOLS.has(tool) && path) {
      pushUnique(changedFiles, seenChanged, path);
    }

    if (operation.status === "failed") {
      failedApproaches.push(formatFailedApproach(toolName, path, command, note));
    }

    if (command && TEST_COMMAND.test(command)) {
      const shown = truncateCommand(command);
      if (shown) testState = `${shown} — ${operation.status}`;
    }
  }

  return {
    ...(revision ? { revision } : {}),
    relevantFiles,
    changedFiles,
    failedApproaches,
    ...(testState ? { testState } : {}),
    readYields,
  };
};

const formatFailedApproach = (
  toolName: string | undefined,
  path: string | undefined,
  command: string | undefined,
  note: string | undefined,
): string => {
  const detail = path ?? truncateCommand(command);
  const head = [toolName, detail].filter(isPresent).join(" ");
  const line = head.length > 0 ? `${head} — failed` : "failed";
  return note ? `${line} (${note})` : line;
};

const isGenericListing = (toolName: string | undefined, command: string | undefined): boolean => {
  const tool = toolName?.toLowerCase();
  if (tool === "ls" || tool === "pwd") return true;
  return command ? GENERIC_LISTING.test(command) : false;
};

const pushUnique = (values: string[], seen: Set<string>, value: string): void => {
  if (seen.has(value)) return;
  seen.add(value);
  values.push(value);
};

const displayPath = (path: string, workspacePath: string | undefined): string => {
  const stripped = stripWorkspace(path, workspacePath);
  return stripped.length > 0 ? stripped : path;
};

const displayCommand = (command: string, workspacePath: string | undefined): string =>
  collapseSpaces(stripWorkspace(command, workspacePath));

const stripWorkspace = (value: string, workspacePath: string | undefined): string => {
  const workspace = present(workspacePath);
  if (!workspace) return value;
  const prefix = workspace.endsWith("/") ? workspace : `${workspace}/`;
  const stripped = collapseSpaces(value.split(prefix).join("").split(workspace).join(""));
  return stripped.length > 0 ? stripped : value;
};

const truncateCommand = (command: string | undefined): string | undefined => {
  const value = present(command);
  if (!value) return undefined;
  if (value.length <= COMMAND_LIMIT) return value;
  return `${value.slice(0, COMMAND_LIMIT).trimEnd()} …`;
};

const collapseSpaces = (value: string): string => value.replace(/\s+/g, " ").trim();

const present = (value: string | undefined): string | undefined =>
  isPresent(value) ? value : undefined;

const isPresent = (value: string | undefined): value is string =>
  typeof value === "string" && value.length > 0;
