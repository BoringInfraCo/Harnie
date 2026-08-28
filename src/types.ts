export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };

export type PiHarness = "pi";
export type PiSourceFamily = "pi-session-v3" | "pi-session-v4" | "unknown";

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface DiagnosticLocation {
  readonly path?: string | undefined;
  readonly line?: number;
  readonly entryId?: string | undefined;
  readonly contentIndex?: number | undefined;
  readonly toolCallId?: string | undefined;
}

export interface Diagnostic {
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly location: DiagnosticLocation;
  readonly details?: JsonValue | undefined;
}

export interface PiSourceDescriptor {
  readonly harness: PiHarness;
  readonly family: PiSourceFamily;
  readonly sessionId?: string | undefined;
  readonly path?: string | undefined;
}

export interface SourceRecord {
  readonly source: PiSourceDescriptor;
  readonly line: number;
  readonly rawLine: string;
  readonly raw: JsonObject;
  readonly sourceType?: string | undefined;
  readonly entryId?: string | undefined;
  readonly parentId?: string | null | undefined;
  readonly timestamp?: string | undefined;
  readonly diagnostics: readonly Diagnostic[];
}

export interface MalformedSourceLine {
  readonly line: number;
  readonly rawLine: string;
  readonly diagnostics: readonly Diagnostic[];
}

export interface SourceProvenance {
  readonly harness: PiHarness;
  readonly family: PiSourceFamily;
  readonly sessionId?: string | undefined;
  readonly path?: string | undefined;
  readonly line: number;
  readonly entryId?: string | undefined;
  readonly parentId?: string | null | undefined;
  readonly sourceType?: string | undefined;
  readonly contentIndex?: number | undefined;
  readonly toolCallId?: string | undefined;
}

export type NormalizedEventKind =
  | "message"
  | "tool_call"
  | "tool_result"
  | "command"
  | "unknown";

export interface NormalizedEvent {
  readonly id: string;
  readonly kind: NormalizedEventKind;
  readonly provenance: SourceProvenance;
  readonly sourceRecord: SourceRecord;
  readonly data: JsonObject;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ToolCallEvidence {
  readonly callId: string;
  readonly toolName?: string | undefined;
  readonly assistantEntryId?: string | undefined;
  readonly line: number;
  readonly contentIndex: number;
  readonly record: SourceRecord;
  readonly block: JsonObject;
  readonly results: readonly ToolResultEvidence[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface ToolResultEvidence {
  readonly toolCallId: string;
  readonly toolName?: string | undefined;
  readonly entryId?: string | undefined;
  readonly line: number;
  readonly record: SourceRecord;
  readonly message: JsonObject;
  readonly diagnostics: readonly Diagnostic[];
}

export const isJsonObject = (value: JsonValue | unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const asString = (value: JsonValue | undefined): string | undefined =>
  typeof value === "string" ? value : undefined;

export const hasOwn = (value: JsonObject, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);
