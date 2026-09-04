import type { NormalizedEventKind } from "../types.js";
import type { ToolOperation, Work } from "./types.js";

export interface ExecutionEventCounts {
  readonly message: number;
  readonly tool_call: number;
  readonly tool_result: number;
  readonly command: number;
  readonly unknown: number;
}

export interface ExecutionDiff {
  readonly workId: string;
  readonly fromId: string;
  readonly toId: string;
  readonly fromCounts: ExecutionEventCounts;
  readonly toCounts: ExecutionEventCounts;
  readonly keptDecisions: readonly string[];
  readonly addedDecisions: readonly string[];
  readonly removedDecisions: readonly string[];
  readonly keptFindings: readonly string[];
  readonly addedFindings: readonly string[];
  readonly removedFindings: readonly string[];
  readonly keptNextSteps: readonly string[];
  readonly addedNextSteps: readonly string[];
  readonly removedNextSteps: readonly string[];
  readonly keptOperations: readonly string[];
  readonly addedOperations: readonly string[];
  readonly removedOperations: readonly string[];
}

const EVENT_KINDS: readonly NormalizedEventKind[] = [
  "message",
  "tool_call",
  "tool_result",
  "command",
  "unknown",
];

export const executionEventCounts = (work: Work, executionId: string): ExecutionEventCounts => {
  if (!work.executions.some((execution) => execution.id === executionId)) {
    throw new Error(`Execution not found: ${executionId}`);
  }
  const counts: Record<NormalizedEventKind, number> = {
    message: 0,
    tool_call: 0,
    tool_result: 0,
    command: 0,
    unknown: 0,
  };
  for (const event of work.events) {
    if (event.executionId !== executionId) continue;
    if ((EVENT_KINDS as readonly string[]).includes(event.kind)) {
      counts[event.kind] += 1;
    }
  }
  return {
    message: counts.message,
    tool_call: counts.tool_call,
    tool_result: counts.tool_result,
    command: counts.command,
    unknown: counts.unknown,
  };
};

export const diffExecutions = (work: Work, fromId: string, toId: string): ExecutionDiff => {
  const fromExecution = work.executions.find((execution) => execution.id === fromId);
  if (!fromExecution) {
    throw new Error(`Execution not found: ${fromId}`);
  }
  const toExecution = work.executions.find((execution) => execution.id === toId);
  if (!toExecution) {
    throw new Error(`Execution not found: ${toId}`);
  }
  const fromCounts = executionEventCounts(work, fromId);
  const toCounts = executionEventCounts(work, toId);
  const executionByEvent = new Map<string, string>();
  for (const event of work.events) {
    if (!executionByEvent.has(event.id)) {
      executionByEvent.set(event.id, event.executionId);
    }
  }
  const decisions = splitClaim(
    (work.decisions ?? []).map((decision) => ({
      text: decision.summary,
      executions: executionsForEvidence(decision.evidence, executionByEvent),
    })),
    fromId,
    toId,
  );
  const findings = splitClaim(
    (work.findings ?? []).map((finding) => ({
      text: finding.statement,
      executions: executionsForEvidence(finding.evidence, executionByEvent),
    })),
    fromId,
    toId,
  );
  const nextSteps = splitClaim(
    (work.nextSteps ?? []).map((step) => ({
      text: step.description,
      executions: executionsForEvidence(step.evidence, executionByEvent),
    })),
    fromId,
    toId,
  );
  const operations = splitClaim(
    (work.operations ?? []).map((operation) => ({
      text: formatOperation(operation),
      executions: executionsForEvidence(operation.evidence, executionByEvent),
    })),
    fromId,
    toId,
  );
  return {
    workId: work.id,
    fromId,
    toId,
    fromCounts,
    toCounts,
    keptDecisions: decisions.kept,
    addedDecisions: decisions.added,
    removedDecisions: decisions.removed,
    keptFindings: findings.kept,
    addedFindings: findings.added,
    removedFindings: findings.removed,
    keptNextSteps: nextSteps.kept,
    addedNextSteps: nextSteps.added,
    removedNextSteps: nextSteps.removed,
    keptOperations: operations.kept,
    addedOperations: operations.added,
    removedOperations: operations.removed,
  };
};

const executionsForEvidence = (
  evidence: readonly string[],
  executionByEvent: ReadonlyMap<string, string>,
): readonly string[] => {
  const executions: string[] = [];
  for (const eventId of evidence) {
    const executionId = executionByEvent.get(eventId);
    if (executionId && !executions.includes(executionId)) {
      executions.push(executionId);
    }
  }
  return executions;
};

const splitClaim = (
  claims: readonly { text: string; executions: readonly string[] }[],
  fromId: string,
  toId: string,
): { kept: readonly string[]; added: readonly string[]; removed: readonly string[] } => {
  const fromTexts = uniqueTexts(claims.filter((claim) => claim.executions.includes(fromId)).map((claim) => claim.text));
  const toTexts = uniqueTexts(claims.filter((claim) => claim.executions.includes(toId)).map((claim) => claim.text));
  const fromSet = new Set(fromTexts);
  const toSet = new Set(toTexts);
  return {
    kept: toTexts.filter((text) => fromSet.has(text)),
    added: toTexts.filter((text) => !fromSet.has(text)),
    removed: fromTexts.filter((text) => !toSet.has(text)),
  };
};

const uniqueTexts = (texts: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const text of texts) {
    if (text === "" || seen.has(text)) continue;
    seen.add(text);
    unique.push(text);
  }
  return unique;
};

const formatOperation = (operation: ToolOperation): string => {
  const detail = operation.path ?? operation.command ?? operation.note ?? "";
  const parts = [operation.toolName, detail].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  const head = parts.join(" ");
  return head.length > 0 ? `${head} — ${operation.status}` : operation.status;
};
