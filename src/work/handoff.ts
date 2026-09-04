import type { JsonObject, NormalizedEventKind } from "../types.js";
import { asString, isJsonObject } from "../types.js";
import { extractObservedContext } from "./context.js";
import type { Execution, Work, WorkEvent } from "./types.js";

export interface HandoffExecution {
  readonly harness: string;
  readonly provider?: string;
  readonly model?: string;
  readonly sourceId?: string;
  readonly sourceFormat?: string;
}

export interface Handoff {
  readonly workId: string;
  readonly goal?: string;
  readonly workspacePath?: string;
  readonly execution?: HandoffExecution;
  readonly executions?: readonly HandoffExecution[];
  readonly currentState?: string;
  readonly decisions: readonly string[];
  readonly findings: readonly string[];
  readonly nextSteps: readonly string[];
  readonly operations: readonly string[];
  readonly filesTouched: readonly string[];
  readonly revision?: string;
  readonly relevantFiles?: readonly string[];
  readonly changedFiles?: readonly string[];
  readonly failedApproaches?: readonly string[];
  readonly testState?: string;
  readonly readYields?: readonly string[];
  readonly eventCounts: {
    readonly message: number;
    readonly tool_call: number;
    readonly tool_result: number;
    readonly command: number;
    readonly unknown: number;
  };
  readonly diagnosticCodes: readonly string[];
  readonly provenance: {
    readonly from: "work";
    readonly sourceHarness?: string;
    readonly sourceSession?: string;
  };
}

type OperationStatus = "succeeded" | "failed" | "pending";

interface ObservedOperation {
  readonly toolName?: string;
  readonly path?: string;
  readonly command?: string;
  readonly status: OperationStatus;
}

interface WorkOperationLike {
  readonly toolName?: string;
  readonly name?: string;
  readonly path?: string;
  readonly command?: string;
  readonly status?: string;
  readonly isError?: boolean;
  readonly note?: string;
  readonly notes?: string;
}

type WorkWithOperations = Work & {
  readonly operations?: readonly (string | WorkOperationLike)[];
};

const COMMAND_LIMIT = 40;

export const buildHandoffFromWork = (work: Work): Handoff => {
  const decisions = compact(work.decisions?.map((decision) => decision.summary));
  const findings = compact(work.findings?.map((finding) => finding.statement));
  const nextSteps = compact(work.nextSteps?.map((step) => step.description));
  const diagnosticCodes = uniqueDiagnosticCodes(work);
  const executions = work.executions.flatMap((item) => {
    const mapped = toHandoffExecution(item);
    return mapped ? [mapped] : [];
  });
  const execution = executions[0];
  const records = operationsFromWork(work);
  const operations = records.map(formatOperationLine);
  const filesTouched = uniquePaths(records);
  const currentState = resolveCurrentState(nextSteps, diagnosticCodes, records);
  const goal = present(work.goal?.statement);
  const workspacePath = present(work.workspace?.path);
  const context = extractObservedContext(work);
  const sourceHarness = uniqueJoined(executions.map((item) => item.harness));
  const sourceSession = uniqueJoined(executions.map((item) => item.sourceId));

  return {
    workId: work.id,
    ...(goal ? { goal } : {}),
    ...(workspacePath ? { workspacePath } : {}),
    ...(execution ? { execution } : {}),
    ...(executions.length > 0 ? { executions } : {}),
    ...(currentState ? { currentState } : {}),
    decisions,
    findings,
    nextSteps,
    operations,
    filesTouched,
    ...(context.revision ? { revision: context.revision } : {}),
    ...(context.relevantFiles.length > 0 ? { relevantFiles: context.relevantFiles } : {}),
    ...(context.changedFiles.length > 0 ? { changedFiles: context.changedFiles } : {}),
    ...(context.failedApproaches.length > 0 ? { failedApproaches: context.failedApproaches } : {}),
    ...(context.testState ? { testState: context.testState } : {}),
    ...(context.readYields.length > 0 ? { readYields: context.readYields } : {}),
    eventCounts: countEvents(work.events),
    diagnosticCodes,
    provenance: {
      from: "work",
      ...(sourceHarness ? { sourceHarness } : {}),
      ...(sourceSession ? { sourceSession } : {}),
    },
  };
};

const toHandoffExecution = (execution: Execution | undefined): HandoffExecution | undefined => {
  if (!execution) return undefined;
  const provider = present(execution.provider);
  const model = present(execution.model);
  const sourceId = present(execution.sourceSession.sourceId);
  const sourceFormat = present(execution.sourceSession.sourceFormat);
  return {
    harness: execution.harness,
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(sourceId ? { sourceId } : {}),
    ...(sourceFormat ? { sourceFormat } : {}),
  };
};

const resolveCurrentState = (
  nextSteps: readonly string[],
  diagnosticCodes: readonly string[],
  operations: readonly ObservedOperation[],
): string | undefined => {
  const pending = operations.filter((operation) => operation.status === "pending");
  const pendingHint = formatPendingHint(pending[0]);

  if (nextSteps.length > 0) {
    const base = `Unresolved: ${nextSteps.join("; ")}`;
    return pendingHint && !base.includes(pendingHint) ? `${base} (${pendingHint})` : base;
  }

  if (pending.length > 0) {
    return pendingHint ? `Unresolved: pending ${pendingHint}` : "Unresolved: pending tool activity";
  }

  const succeededEditPaths = uniquePaths(
    operations.filter((operation) =>
      (operation.toolName === "edit" || operation.toolName === "write") &&
      operation.status === "succeeded"
    ),
  );
  if (succeededEditPaths.length > 0) {
    return `Edits reported success on ${succeededEditPaths.join(", ")}. Verification not recorded.`;
  }

  if (diagnosticCodes.includes("missing_tool_result")) return "Unresolved: pending tool activity";
  return undefined;
};

const formatPendingHint = (operation: ObservedOperation | undefined): string | undefined => {
  if (!operation) return undefined;
  const detail = operation.path ?? truncateCommand(operation.command);
  const parts = [operation.toolName, detail].filter(isPresent);
  return parts.length > 0 ? parts.join(" ") : undefined;
};

const operationsFromWork = (work: Work): readonly ObservedOperation[] => {
  const declared = (work as WorkWithOperations).operations;
  if (declared !== undefined && declared.length > 0) {
    return declared.flatMap((item) => operationFromDeclared(item, work.workspace?.path));
  }
  return operationsFromEvents(work);
};

const operationFromDeclared = (
  item: string | WorkOperationLike,
  workspacePath: string | undefined,
): readonly ObservedOperation[] => {
  if (typeof item === "string") return parseOperationLine(item, workspacePath);
  const toolName = present(item.toolName) ?? present(item.name);
  const path = isPresent(item.path) ? displayPath(item.path, workspacePath) : undefined;
  const command = isPresent(item.command) ? displayCommand(item.command, workspacePath) : undefined;
  const note = shortNote(item.note) ?? shortNote(item.notes);
  if (!toolName && !path && !command) return [];
  return [{
    ...(toolName ? { toolName } : {}),
    ...(path ? { path } : {}),
    ...(command ? { command } : {}),
    status: statusFromDeclared(item, note),
  }];
};

const parseOperationLine = (line: string, workspacePath: string | undefined): readonly ObservedOperation[] => {
  const trimmed = line.replace(/^•\s*/, "").trim();
  if (!trimmed) return [];
  const split = trimmed.split(/\s+—\s+/);
  const head = split[0] ?? trimmed;
  const status = statusFromText(split[1]);
  const tokens = head.split(/\s+/);
  const toolName = present(tokens[0]);
  const rest = tokens.slice(1).join(" ");
  const path = rest.includes("/") || /\.\w+$/.test(rest) ? displayPath(rest, workspacePath) : undefined;
  const command = path ? undefined : (present(rest) ? displayCommand(rest, workspacePath) : undefined);
  return [{
    ...(toolName ? { toolName } : {}),
    ...(path ? { path } : {}),
    ...(command ? { command } : {}),
    status,
  }];
};

const operationsFromEvents = (work: Work): readonly ObservedOperation[] => {
  const results = new Map<string, WorkEvent>();
  for (const event of work.events) {
    if (event.kind !== "tool_result") continue;
    const callId = asString(event.payload.toolCallId);
    if (callId && !results.has(callId)) results.set(callId, event);
  }

  const operations: ObservedOperation[] = [];
  for (const event of work.events) {
    if (event.kind !== "tool_call") continue;
    const toolName = asString(event.payload.toolName);
    const args = isJsonObject(event.payload.arguments) ? event.payload.arguments : undefined;
    const path = pathFromArguments(args);
    const command = args ? asString(args.command) : undefined;
    const callId = asString(event.payload.toolCallId);
    const result = callId ? results.get(callId) : undefined;
    const display = path ? displayPath(path, work.workspace?.path) : undefined;
    const shownCommand = command ? displayCommand(command, work.workspace?.path) : undefined;
    if (!toolName && !display && !shownCommand) continue;
    operations.push({
      ...(toolName ? { toolName } : {}),
      ...(display ? { path: display } : {}),
      ...(shownCommand ? { command: shownCommand } : {}),
      status: statusFromResult(result),
    });
  }
  return operations;
};

const pathFromArguments = (args: JsonObject | undefined): string | undefined => {
  if (!args) return undefined;
  return asString(args.path) ?? asString(args.file) ?? asString(args.filePath) ?? asString(args.file_path);
};

const statusFromResult = (result: WorkEvent | undefined): OperationStatus => {
  if (!result) return "pending";
  if (result.payload.isError === true) return "failed";
  return "succeeded";
};

const statusFromDeclared = (record: WorkOperationLike, note: string | undefined): OperationStatus => {
  if (record.isError === true) return "failed";
  const fromStatus = statusFromText(record.status);
  if (record.status && record.status.length > 0) return fromStatus;
  if (note && /fail|error/i.test(note)) return "failed";
  if (note && /succeed|success|replaced|ok/i.test(note)) return "succeeded";
  return "pending";
};

const statusFromText = (value: string | undefined): OperationStatus => {
  const status = value?.trim().toLowerCase();
  if (status === "succeeded" || status === "success" || status === "ok" || status === "completed") {
    return "succeeded";
  }
  if (status === "failed" || status === "failure" || status === "error") return "failed";
  return "pending";
};

const formatOperationLine = (operation: ObservedOperation): string => {
  const detail = operation.path ?? truncateCommand(operation.command);
  const parts = [operation.toolName, detail].filter(isPresent);
  const head = parts.join(" ");
  return head.length > 0 ? `${head} — ${operation.status}` : operation.status;
};

const uniquePaths = (operations: readonly ObservedOperation[]): readonly string[] => {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const operation of operations) {
    const path = present(operation.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
  }
  return paths;
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

const shortNote = (value: string | undefined): string | undefined => {
  const note = present(value);
  if (!note || note.length > 80 || note.includes("\n")) return undefined;
  return note;
};

const collapseSpaces = (value: string): string => value.replace(/\s+/g, " ").trim();

const countEvents = (events: Work["events"]): Handoff["eventCounts"] => {
  const counts = {
    message: 0,
    tool_call: 0,
    tool_result: 0,
    command: 0,
    unknown: 0,
  };
  for (const event of events) {
    counts[countKey(event.kind)] += 1;
  }
  return counts;
};

const countKey = (kind: NormalizedEventKind): keyof Handoff["eventCounts"] => {
  switch (kind) {
    case "message":
    case "tool_call":
    case "tool_result":
    case "command":
    case "unknown":
      return kind;
  }
};

const uniqueJoined = (values: readonly (string | undefined)[]): string | undefined => {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (!isPresent(value) || seen.has(value)) continue;
    seen.add(value);
    unique.push(value);
  }
  return unique.length > 0 ? unique.join(", ") : undefined;
};

const uniqueDiagnosticCodes = (work: Work): readonly string[] => {
  const codes: string[] = [];
  const seen = new Set<string>();
  const add = (code: string): void => {
    if (!isPresent(code) || seen.has(code)) return;
    seen.add(code);
    codes.push(code);
  };
  for (const diagnostic of work.diagnostics) add(diagnostic.code);
  for (const event of work.events) {
    for (const diagnostic of event.diagnostics) add(diagnostic.code);
  }
  return codes;
};

const compact = (values: readonly (string | undefined)[] | undefined): readonly string[] =>
  (values ?? []).filter(isPresent);

const present = (value: string | undefined): string | undefined =>
  isPresent(value) ? value : undefined;

const isPresent = (value: string | undefined): value is string =>
  typeof value === "string" && value.length > 0;
