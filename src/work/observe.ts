import { diagnostic } from "../diagnostics.js";
import type { Diagnostic } from "../types.js";
import type { Execution, ObservedWorkInput, Work, WorkEvent } from "./types.js";

export const reconstructObservedWork = (input: ObservedWorkInput): Work => {
  const sourceId = input.sourceId ?? "unknown-session";
  const workId = observedIdentity("work", input.harness, sourceId);
  const executionId = observedIdentity("execution", input.harness, sourceId);
  const diagnostics: Diagnostic[] = [...(input.diagnostics ?? [])];

  if (!input.sourceId) {
    diagnostics.push(diagnostic(
      "missing_source_session_id",
      "warning",
      "Work was reconstructed without an observed source session id.",
      location(input),
    ));
  }

  if (!input.workspacePath) {
    diagnostics.push(diagnostic(
      "missing_workspace",
      "warning",
      "Work was reconstructed without an observed workspace path.",
      location(input),
    ));
  }

  const events: WorkEvent[] = input.events.map((event) => ({
    id: event.id,
    workId,
    executionId,
    kind: event.kind,
    ...(event.timestamp ? { timestamp: event.timestamp } : {}),
    payload: event.payload,
    provenance: event.provenance,
    diagnostics: event.diagnostics,
  }));

  const execution: Execution = {
    id: executionId,
    workId,
    harness: input.harness,
    sourceSession: {
      harness: input.harness,
      sourceId,
      ...(input.sourceFormat ? { sourceFormat: input.sourceFormat } : {}),
      ...(input.sourceLocation ? { sourceLocation: input.sourceLocation } : {}),
    },
    ...(input.provider ? { provider: input.provider } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.startedAt ? { startedAt: input.startedAt } : {}),
  };

  const updatedAt = lastTimestamp(events) ?? input.startedAt;

  return {
    id: workId,
    ...(input.workspacePath ? { workspace: { path: input.workspacePath } } : {}),
    ...(input.startedAt ? { createdAt: input.startedAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    executions: [execution],
    events,
    diagnostics,
  };
};

export const observedIdentity = (
  kind: "work" | "execution",
  harness: string,
  sourceId: string,
): string => `${kind}:${harness}:${sourceId}`;

const lastTimestamp = (events: readonly WorkEvent[]): string | undefined => {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const timestamp = events[index]?.timestamp;
    if (timestamp) return timestamp;
  }
  return undefined;
};

const location = (input: ObservedWorkInput) => ({
  ...(input.sourceLocation ? { path: input.sourceLocation } : {}),
});
