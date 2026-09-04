import type { Diagnostic, JsonObject, NormalizedEventKind } from "../types.js";

export type ObservationClass = "observed" | "derived";

export interface Provenance {
  readonly harness: string;
  readonly sourceFormat?: string | undefined;
  readonly sourceSession?: string | undefined;
  readonly sourceLocation?: string | undefined;
  readonly sourceType?: string | undefined;
  readonly sourceEntry?: string | undefined;
  readonly sourceParent?: string | null | undefined;
  readonly line: number;
  readonly contentIndex?: number | undefined;
  readonly toolCallId?: string | undefined;
  readonly observation: ObservationClass;
}

export interface Workspace {
  readonly path: string;
}

export interface SourceSession {
  readonly harness: string;
  readonly sourceId: string;
  readonly sourceFormat?: string | undefined;
  readonly sourceLocation?: string | undefined;
}

export interface Execution {
  readonly id: string;
  readonly workId: string;
  readonly harness: string;
  readonly model?: string | undefined;
  readonly provider?: string | undefined;
  readonly sourceSession: SourceSession;
  readonly startedAt?: string | undefined;
}

export interface WorkEvent {
  readonly id: string;
  readonly workId: string;
  readonly executionId: string;
  readonly kind: NormalizedEventKind;
  readonly timestamp?: string | undefined;
  readonly payload: JsonObject;
  readonly provenance: Provenance;
  readonly diagnostics: readonly Diagnostic[];
}

export interface DerivedGoal {
  readonly statement: string;
  readonly evidence: readonly string[];
  readonly provenance: Provenance;
  readonly rule: string;
}

export interface Decision {
  readonly id: string;
  readonly summary: string;
  readonly evidence: readonly string[];
  readonly provenance: Provenance;
  readonly rule: string;
}

export interface Finding {
  readonly id: string;
  readonly statement: string;
  readonly evidence: readonly string[];
  readonly provenance: Provenance;
  readonly rule: string;
}

export interface NextStep {
  readonly id: string;
  readonly description: string;
  readonly evidence: readonly string[];
  readonly provenance: Provenance;
  readonly rule: string;
}

export type ToolOperationStatus = "pending" | "succeeded" | "failed";

export interface ToolOperation {
  readonly id: string;
  readonly toolName?: string;
  readonly path?: string;
  readonly command?: string;
  readonly status: ToolOperationStatus;
  readonly note?: string;
  readonly evidence: readonly string[];
  readonly provenance: Provenance;
  readonly rule: string;
}

export interface Checkpoint {
  readonly id: string;
  readonly workId: string;
  readonly executionId?: string | undefined;
  readonly message: string;
  readonly createdAt: string;
  readonly eventOrdinalWatermark: number;
  readonly eventCount: number;
  readonly goal?: DerivedGoal;
  readonly decisions: readonly Decision[];
  readonly findings: readonly Finding[];
  readonly nextSteps: readonly NextStep[];
  readonly operations: readonly ToolOperation[];
}

export interface Work {
  readonly id: string;
  readonly workspace?: Workspace | undefined;
  readonly createdAt?: string | undefined;
  readonly updatedAt?: string | undefined;
  readonly forkedFrom?:
    | {
        readonly workId: string;
        readonly checkpointId?: string | undefined;
        readonly message?: string | undefined;
      }
    | undefined;
  readonly executions: readonly Execution[];
  readonly events: readonly WorkEvent[];
  readonly diagnostics: readonly Diagnostic[];
  readonly goal?: DerivedGoal;
  readonly decisions?: readonly Decision[];
  readonly findings?: readonly Finding[];
  readonly nextSteps?: readonly NextStep[];
  readonly operations?: readonly ToolOperation[];
  readonly checkpoints?: readonly Checkpoint[] | undefined;
}

export interface ObservedEvent {
  readonly id: string;
  readonly kind: NormalizedEventKind;
  readonly timestamp?: string | undefined;
  readonly payload: JsonObject;
  readonly provenance: Provenance;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ObservedWorkInput {
  readonly harness: string;
  readonly sourceId?: string | undefined;
  readonly sourceFormat?: string | undefined;
  readonly sourceLocation?: string | undefined;
  readonly workspacePath?: string | undefined;
  readonly startedAt?: string | undefined;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly events: readonly ObservedEvent[];
  readonly diagnostics?: readonly Diagnostic[] | undefined;
}
