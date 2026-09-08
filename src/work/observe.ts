import { diagnostic } from "../diagnostics.js";
import type { Diagnostic } from "../types.js";
import { redactJsonValue, secretRedactedDiagnostic, summarizeRedactions } from "./redact.js";
import type { Execution, ObservedWorkInput, Work, WorkEvent, Workspace } from "./types.js";

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

  const events: WorkEvent[] = input.events.map((event) => {
    // Ingestion choke point: obvious secrets are redacted from every observed
    // payload before the Work can reach SQLite. Per-event diagnostics carry
    // the kind, field path, and source provenance (never the secret value).
    const redacted = redactJsonValue(event.payload, "payload");
    if (redacted.redactions.length === 0) {
      return {
        id: event.id,
        workId,
        executionId,
        kind: event.kind,
        ...(event.timestamp ? { timestamp: event.timestamp } : {}),
        payload: event.payload,
        provenance: event.provenance,
        diagnostics: event.diagnostics,
      };
    }
    const summary = summarizeRedactions(redacted.redactions);
    return {
      id: event.id,
      workId,
      executionId,
      kind: event.kind,
      ...(event.timestamp ? { timestamp: event.timestamp } : {}),
      payload: redacted.value as typeof event.payload,
      provenance: event.provenance,
      diagnostics: [
        ...event.diagnostics,
        secretRedactedDiagnostic(
          summary,
          `Redacted ${summary.count} secret value(s) (${summary.kinds.join(", ")}) from ingested session text.`,
          {
            ...(event.provenance.sourceLocation ? { path: event.provenance.sourceLocation } : {}),
            line: event.provenance.line,
            ...(event.provenance.sourceEntry ? { entryId: event.provenance.sourceEntry } : {}),
            ...(event.provenance.contentIndex !== undefined ? { contentIndex: event.provenance.contentIndex } : {}),
            ...(event.provenance.toolCallId ? { toolCallId: event.provenance.toolCallId } : {}),
          },
        ),
      ],
    };
  });

  if (events.some((event) => event.diagnostics.some((item) => item.code === "secret_redacted"))) {
    const affected = events.filter((event) =>
      event.diagnostics.some((item) => item.code === "secret_redacted")).length;
    diagnostics.push(diagnostic(
      "secret_redacted",
      "info",
      `Redacted obvious secrets from ${affected} ingested event(s). Secret values replaced with markers; see event diagnostics for kinds and provenance.`,
      location(input),
    ));
  }

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

export const attachObservedWork = (existing: Work, incoming: Work): Work => {
  const executions: Execution[] = [...existing.executions];
  for (const execution of incoming.executions) {
    if (executions.some((known) => known.id === execution.id)) continue;
    executions.push({ ...execution, workId: existing.id });
  }
  const incomingById = new Map(incoming.events.map((event) => [event.id, event]));
  const refreshedDiagnostics = new Set<string>();
  const knownEventIds = new Set(existing.events.map((event) => event.id));
  const events: WorkEvent[] = existing.events.map((event) => {
    const refreshed = incomingById.get(event.id);
    if (!refreshed || refreshed.executionId !== event.executionId) return event;
    for (const item of event.diagnostics) refreshedDiagnostics.add(JSON.stringify(item));
    // Source records stay immutable; correlation diagnostics reflect the latest snapshot.
    return { ...event, diagnostics: refreshed.diagnostics };
  });
  for (const event of incoming.events) {
    if (knownEventIds.has(event.id)) continue;
    knownEventIds.add(event.id);
    events.push({ ...event, workId: existing.id });
  }
  const diagnostics: Diagnostic[] = existing.diagnostics.filter((item) =>
    !refreshedDiagnostics.has(JSON.stringify(item))
  );
  for (const item of incoming.diagnostics) {
    if (diagnostics.some((known) => JSON.stringify(known) === JSON.stringify(item))) continue;
    diagnostics.push(item);
  }
  const updatedAt = [existing.updatedAt, incoming.updatedAt]
    .filter((value): value is string => value !== undefined).sort().at(-1);
  return {
    id: existing.id,
    ...(existing.workspace ?? incoming.workspace ? { workspace: (existing.workspace ?? incoming.workspace) as Workspace } : {}),
    ...(existing.createdAt ?? incoming.createdAt ? { createdAt: (existing.createdAt ?? incoming.createdAt) as string } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    executions,
    events,
    diagnostics,
  };
};

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

// Reconcile against this view's event boundary, so live work and checkpoints agree
// with their own evidence without rewriting historical source records.
export const reconcileToolDiagnostics = (work: Work): Work => {
  const results = new Set(work.events.filter((event) => event.kind === "tool_result")
    .map((event) => JSON.stringify([event.executionId, event.payload.toolCallId])));
  const resolved = new Set<string>();
  const events = work.events.map((event) => {
    if (event.kind !== "tool_call" || typeof event.payload.toolCallId !== "string" ||
        !results.has(JSON.stringify([event.executionId, event.payload.toolCallId]))) return event;
    return { ...event, diagnostics: event.diagnostics.filter((item) => {
      if (item.code !== "missing_tool_result") return true;
      resolved.add(JSON.stringify([event.executionId, item]));
      return false;
    }) };
  });
  const reconciled = events.map((event) => ({
    ...event,
    diagnostics: event.diagnostics.filter((item) => !resolved.has(JSON.stringify([event.executionId, item]))),
  }));
  const retainedDiagnostics = new Set(reconciled.flatMap((event) => event.diagnostics.map((item) => JSON.stringify(item))));
  const removedDiagnostics = new Set(work.events.flatMap((event) => event.diagnostics
    .filter((item) => resolved.has(JSON.stringify([event.executionId, item])))
    .map((item) => JSON.stringify(item))));
  return {
    ...work,
    events: reconciled,
    diagnostics: work.diagnostics.filter((item) =>
      !removedDiagnostics.has(JSON.stringify(item)) || retainedDiagnostics.has(JSON.stringify(item))
    ),
  };
};
