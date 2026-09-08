import { asString, isJsonObject } from "../types.js";
import { redactText, secretRedactedDiagnostic, summarizeRedactions, type SecretRedaction } from "./redact.js";
import { extractToolOperations, indexToolResults, toolResultKey } from "./operations.js";
import type {
  Decision,
  DerivedGoal,
  Finding,
  NextStep,
  Provenance,
  ToolOperation,
  Work,
  WorkEvent,
} from "./types.js";

const DECISION_SENTENCE = /\bI will\b|\bI'll\b/i;
const SENTENCE_SPLIT = /[.!?]+\s+/;
const SUBSTANCE = /[A-Za-z0-9]/;
const THINKING_BLOCK_TYPES = new Set(["thinking", "reasoning"]);

export const deriveObservedWork = (work: Work): Work => {
  const goal = deriveGoal(work);
  const decisions = deriveDecisions(work);
  const findings = deriveFindings(work);
  const nextSteps = deriveNextSteps(work);
  const operations = extractToolOperations(work);

  // Derived claims quote session text (goal is the first user message), so
  // redact them as well. On the normal path events are already redacted at
  // observation and this is a no-op; it is defense-in-depth for Work built
  // without the ingestion choke point.
  const redactor = new ClaimRedactor();
  const safeGoal = goal ? redactor.goal(goal) : undefined;
  const safeDecisions = decisions.map((decision, index) => redactor.decision(decision, index));
  const safeFindings = findings.map((finding, index) => redactor.finding(finding, index));
  const safeNextSteps = nextSteps.map((step, index) => redactor.nextStep(step, index));
  const safeOperations = operations.map((operation, index) => redactor.operation(operation, index));

  const diagnostics = redactor.redactions.length === 0
    ? work.diagnostics
    : [...work.diagnostics, redactor.diagnostic()];

  return {
    id: work.id,
    ...(work.workspace ? { workspace: work.workspace } : {}),
    ...(work.createdAt ? { createdAt: work.createdAt } : {}),
    ...(work.updatedAt ? { updatedAt: work.updatedAt } : {}),
    executions: work.executions,
    events: work.events,
    diagnostics,
    ...(safeGoal ? { goal: safeGoal } : {}),
    ...(safeDecisions.length > 0 ? { decisions: safeDecisions } : {}),
    ...(safeFindings.length > 0 ? { findings: safeFindings } : {}),
    ...(safeNextSteps.length > 0 ? { nextSteps: safeNextSteps } : {}),
    ...(safeOperations.length > 0 ? { operations: safeOperations } : {}),
  };
};

class ClaimRedactor {
  redactions: SecretRedaction[] = [];

  text(value: string, field: string): string {
    const redacted = redactText(value, field);
    if (redacted.text === value) return value;
    this.redactions.push(...redacted.redactions);
    return redacted.text;
  }

  goal(value: DerivedGoal): DerivedGoal {
    const statement = this.text(value.statement, "goal.statement");
    return statement === value.statement ? value : { ...value, statement };
  }

  decision(value: Decision, index: number): Decision {
    const summary = this.text(value.summary, `decisions[${index}].summary`);
    return summary === value.summary ? value : { ...value, summary };
  }

  finding(value: Finding, index: number): Finding {
    const statement = this.text(value.statement, `findings[${index}].statement`);
    return statement === value.statement ? value : { ...value, statement };
  }

  nextStep(value: NextStep, index: number): NextStep {
    const description = this.text(value.description, `nextSteps[${index}].description`);
    return description === value.description ? value : { ...value, description };
  }

  operation(value: ToolOperation, index: number): ToolOperation {
    let next = value;
    if (value.path !== undefined) {
      const path = this.text(value.path, `operations[${index}].path`);
      if (path !== value.path) next = { ...next, path };
    }
    if (value.command !== undefined) {
      const command = this.text(value.command, `operations[${index}].command`);
      if (command !== value.command) next = { ...next, command };
    }
    if (value.note !== undefined) {
      const note = this.text(value.note, `operations[${index}].note`);
      if (note !== value.note) next = { ...next, note };
    }
    return next;
  }

  diagnostic() {
    const summary = summarizeRedactions(this.redactions);
    return secretRedactedDiagnostic(
      summary,
      `Redacted ${summary.count} secret value(s) (${summary.kinds.join(", ")}) from derived claims.`,
      {},
    );
  }
}

const deriveGoal = (work: Work): DerivedGoal | undefined => {
  for (const event of work.events) {
    if (event.kind !== "message" || event.payload.role !== "user") continue;
    const statement = extractText(event).trim();
    if (!statement) continue;
    return claim({
      statement,
      evidence: [event.id],
      provenance: derivedProvenance(event),
      rule: "first-user-message",
    });
  }
  return undefined;
};

const deriveDecisions = (work: Work): readonly Decision[] => {
  const decisions: Decision[] = [];

  for (const event of work.events) {
    if (!isAssistantMessage(event)) continue;
    sentences(extractText(event)).forEach((sentence, index) => {
      if (!DECISION_SENTENCE.test(sentence)) return;
      const decision = claim({
        id: `decision:${work.id}:${event.id}:${index}`,
        summary: sentence,
        evidence: [event.id],
        provenance: derivedProvenance(event),
        rule: "assistant-i-will",
      });
      if (decision) decisions.push(decision);
    });
  }

  return decisions;
};

const deriveFindings = (work: Work): readonly Finding[] => {
  const findings: Finding[] = [];
  let seenToolResult = false;

  for (const event of work.events) {
    if (event.kind === "tool_result") seenToolResult = true;
    if (!seenToolResult || !isAssistantMessage(event)) continue;

    sentences(extractText(event)).forEach((sentence, index) => {
      if (DECISION_SENTENCE.test(sentence) || !hasSubstance(sentence)) return;
      const finding = claim({
        id: `finding:${work.id}:${event.id}:${index}`,
        statement: sentence,
        evidence: [event.id],
        provenance: derivedProvenance(event),
        rule: "assistant-after-tools",
      });
      if (finding) findings.push(finding);
    });
  }

  return findings;
};

const deriveNextSteps = (work: Work): readonly NextStep[] => {
  const results = indexToolResults(work);
  const events = work.events.filter((event) => {
    if (event.kind !== "tool_call") return false;
    const callId = asString(event.payload.toolCallId);
    return !callId || !results.has(toolResultKey(event.executionId, callId));
  });
  const nextSteps: NextStep[] = [];

  for (const event of events) {
    const toolName = asString(event.payload.toolName);
    const path = toolCallPath(event);
    const nextStep = claim({
      id: `next:${work.id}:${event.id}`,
      description: pendingToolCallDescription(toolName, path),
      evidence: [event.id],
      provenance: derivedProvenance(event),
      rule: "missing-tool-result",
    });
    if (nextStep) nextSteps.push(nextStep);
  }

  return nextSteps;
};

const toolCallPath = (event: WorkEvent): string | undefined => {
  if (!isJsonObject(event.payload.arguments)) return undefined;
  const path = asString(event.payload.arguments.path);
  return path && path.length > 0 ? path : undefined;
};

const pendingToolCallDescription = (toolName: string | undefined, path: string | undefined): string => {
  const parts = ["Complete pending tool call"];
  if (toolName) parts.push(toolName);
  if (path) parts.push(path);
  return parts.join(" ");
};

const extractText = (event: WorkEvent): string => {
  const content = event.payload.content;
  if (typeof content === "string") return stripThinkingMarkup(content);
  if (!Array.isArray(content)) return "";
  const blocks: string[] = [];
  for (const block of content) {
    if (!isJsonObject(block)) continue;
    const type = asString(block.type);
    if (type !== undefined && THINKING_BLOCK_TYPES.has(type)) continue;
    if (type !== "text") continue;
    if (typeof block.text === "string") blocks.push(block.text);
  }
  return stripThinkingMarkup(blocks.join("\n"));
};

const stripThinkingMarkup = (text: string): string => {
  const closed = text.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, "\n");
  return closed.replace(/<thinking\b[^>]*>[\s\S]*$/gi, "").trim();
};

const sentences = (text: string): string[] =>
  text.split(SENTENCE_SPLIT).map((sentence) => sentence.trim());

const hasSubstance = (sentence: string): boolean =>
  sentence.length > 0 && SUBSTANCE.test(sentence);

const isAssistantMessage = (event: WorkEvent): boolean =>
  event.kind === "message" && event.payload.role === "assistant";

const derivedProvenance = (event: WorkEvent): Provenance => ({
  harness: event.provenance.harness,
  ...(event.provenance.sourceSession !== undefined ? { sourceSession: event.provenance.sourceSession } : {}),
  line: event.provenance.line,
  ...(event.provenance.sourceEntry !== undefined ? { sourceEntry: event.provenance.sourceEntry } : {}),
  observation: "derived",
});

const claim = <T extends { evidence: readonly string[] }>(value: T): T | undefined =>
  value.evidence.length > 0 ? value : undefined;
