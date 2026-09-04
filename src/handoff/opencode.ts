import type { Handoff } from "../work/handoff.js";

const EVENT_KINDS = ["message", "tool_call", "tool_result", "command", "unknown"] as const;

type OpenCodeHandoffInput = Omit<
  Handoff,
  | "operations"
  | "filesTouched"
  | "execution"
  | "executions"
  | "revision"
  | "relevantFiles"
  | "changedFiles"
  | "failedApproaches"
  | "testState"
  | "readYields"
> & {
  readonly operations?: readonly string[];
  readonly filesTouched?: readonly string[];
  readonly execution?: Handoff["execution"];
  readonly executions?: Handoff["executions"];
  readonly revision?: string;
  readonly relevantFiles?: readonly string[];
  readonly changedFiles?: readonly string[];
  readonly failedApproaches?: readonly string[];
  readonly testState?: string;
  readonly readYields?: readonly string[];
};

export const renderOpenCodeHandoff = (handoff: OpenCodeHandoffInput): string => {
  const sections = [
    "# Harnie handoff",
    "Continue this work. Do not re-investigate from scratch. Use the state below.",
  ];

  pushSection(sections, "Goal", handoff.goal);
  pushSection(sections, "Current state", handoff.currentState);
  pushSection(sections, "Workspace", handoff.workspacePath);
  pushSection(sections, "Repository", handoff.revision);
  pushSection(sections, "Relevant files", formatList(handoff.relevantFiles ?? []));
  pushSection(sections, "Changed files", formatList(handoff.changedFiles ?? []));
  pushSection(sections, "Failed approaches", formatList(handoff.failedApproaches ?? []));
  pushSection(sections, "Test state", handoff.testState);
  pushSection(sections, "Read yields", formatList(handoff.readYields ?? []));
  pushSection(sections, "Execution", formatExecutions(handoff));
  pushSection(sections, "Decisions", formatList(handoff.decisions));
  pushSection(sections, "Findings", formatList(handoff.findings));
  if (!hasRoleFiles(handoff)) {
    pushSection(sections, "Files touched", formatList(handoff.filesTouched ?? []));
  }
  pushSection(sections, "Operations", formatList(handoff.operations ?? []));
  pushSection(sections, "Next steps", formatList(handoff.nextSteps));
  pushSection(sections, "Event summary", formatEventCounts(handoff.eventCounts));
  pushSection(sections, "Diagnostics", formatList(handoff.diagnosticCodes));
  pushSection(sections, "Provenance", formatProvenance(handoff));

  return `${sections.join("\n\n")}\n`;
};

const hasRoleFiles = (handoff: OpenCodeHandoffInput): boolean =>
  (handoff.relevantFiles?.length ?? 0) > 0 || (handoff.changedFiles?.length ?? 0) > 0;

const formatExecutions = (handoff: OpenCodeHandoffInput): string | undefined => {
  if (handoff.executions !== undefined && handoff.executions.length > 1) {
    const blocks = handoff.executions.flatMap((execution) => {
      const body = formatExecution(execution);
      return body ? [body] : [];
    });
    return blocks.length > 0 ? blocks.join("\n\n") : undefined;
  }
  return formatExecution(handoff.execution);
};

const formatExecution = (execution: Handoff["execution"]): string | undefined => {
  if (!execution) return undefined;
  const identity = [execution.harness];
  if (present(execution.provider)) identity.push(execution.provider);
  if (present(execution.model)) identity.push(execution.model);
  const lines = [identity.join(" / ")];
  if (present(execution.sourceFormat)) lines.push(execution.sourceFormat);
  if (present(execution.sourceId)) lines.push(execution.sourceId);
  return lines.join("\n");
};

const formatEventCounts = (counts: Handoff["eventCounts"]): string | undefined => {
  const lines = EVENT_KINDS.flatMap((kind) => {
    const count = counts[kind];
    return count > 0 ? [`- ${kind}: ${count}`] : [];
  });
  return lines.length > 0 ? lines.join("\n") : undefined;
};

const formatProvenance = (handoff: OpenCodeHandoffInput): string | undefined => {
  const lines: string[] = [];
  if (present(handoff.workId)) lines.push(`Work ${handoff.workId}`);
  const session = handoff.provenance.sourceSession;
  if (present(session)) {
    const harness = handoff.provenance.sourceHarness;
    lines.push(present(harness) ? `Source ${harness} session ${session}` : `Source session ${session}`);
  }
  return lines.length > 0 ? lines.join("\n") : undefined;
};

const formatList = (items: readonly string[]): string | undefined => {
  const lines = items.filter(present).map((item) => `- ${item}`);
  return lines.length > 0 ? lines.join("\n") : undefined;
};

const pushSection = (sections: string[], title: string, body: string | undefined): void => {
  if (!present(body)) return;
  sections.push(`## ${title}\n${body}`);
};

const present = (value: string | undefined): value is string =>
  typeof value === "string" && value.length > 0;
