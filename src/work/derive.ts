import { asString, isJsonObject } from "../types.js";
import { extractToolOperations } from "./operations.js";
import type {
  Decision,
  DerivedGoal,
  Finding,
  NextStep,
  Provenance,
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

  return {
    id: work.id,
    ...(work.workspace ? { workspace: work.workspace } : {}),
    ...(work.createdAt ? { createdAt: work.createdAt } : {}),
    ...(work.updatedAt ? { updatedAt: work.updatedAt } : {}),
    executions: work.executions,
    events: work.events,
    diagnostics: work.diagnostics,
    ...(goal ? { goal } : {}),
    ...(decisions.length > 0 ? { decisions } : {}),
    ...(findings.length > 0 ? { findings } : {}),
    ...(nextSteps.length > 0 ? { nextSteps } : {}),
    ...(operations.length > 0 ? { operations } : {}),
  };
};

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
  if (!hasMissingToolResult(work)) return [];

  const pending = work.events.filter((event) =>
    event.kind === "tool_call" && event.diagnostics.some((diag) => diag.code === "missing_tool_result"),
  );
  const events = pending.length > 0 ? pending : lastUnmatchedToolCall(work);
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

const lastUnmatchedToolCall = (work: Work): readonly WorkEvent[] => {
  for (let index = work.events.length - 1; index >= 0; index -= 1) {
    const event = work.events[index];
    if (!event || event.kind !== "tool_call") continue;
    const toolCallId = asString(event.payload.toolCallId);
    if (!toolCallId) continue;
    const matched = work.events.slice(index + 1).some((later) =>
      later.kind === "tool_result" && asString(later.payload.toolCallId) === toolCallId
    );
    if (!matched) return [event];
  }
  return [];
};

const hasMissingToolResult = (work: Work): boolean =>
  work.diagnostics.some((diag) => diag.code === "missing_tool_result") ||
  work.events.some((event) => event.diagnostics.some((diag) => diag.code === "missing_tool_result"));

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
