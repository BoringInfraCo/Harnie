export type OpenCodeHarness = "opencode";
export type OpenCodeSessionFormat = "opencode-session-v1";

export const OPENCODE_HARNESS: OpenCodeHarness = "opencode";
export const OPENCODE_SESSION_FORMAT: OpenCodeSessionFormat = "opencode-session-v1";

export type OpenCodePartType =
  | "text"
  | "tool"
  | "reasoning"
  | "file"
  | "patch"
  | "step-start"
  | "step-finish";

export type OpenCodeToolStatus = "completed" | "error" | "running";

export interface OpenCodeModelRef {
  readonly id: string;
  readonly providerID: string;
}

export interface OpenCodeSessionInfo {
  readonly id: string;
  readonly directory: string;
  readonly title: string;
  readonly agent?: string;
  readonly model?: OpenCodeModelRef;
  readonly version?: string;
  readonly time_created: number;
  readonly time_updated: number;
}

export interface OpenCodeMessagePath {
  readonly cwd?: string;
}

export interface OpenCodeMessageTime {
  readonly created?: number;
  readonly completed?: number;
}

export interface OpenCodeToolTime {
  readonly start?: number;
  readonly end?: number;
}

export interface OpenCodeMessageData {
  readonly role: string;
  readonly parentID?: string;
  readonly path?: OpenCodeMessagePath;
  readonly modelID?: string;
  readonly providerID?: string;
  readonly time?: OpenCodeMessageTime;
}

export interface OpenCodeMessageRecord {
  readonly id: string;
  readonly time_created: number;
  readonly data: OpenCodeMessageData;
}

export interface OpenCodeToolState {
  readonly status?: string;
  readonly input?: OpenCodeToolInput;
  readonly output?: string;
  readonly time?: OpenCodeToolTime;
}

export interface OpenCodeToolInput {
  readonly filePath?: string;
  readonly path?: string;
  readonly pattern?: string;
}

export interface OpenCodePartData {
  readonly type: string;
  readonly text?: string;
  readonly tool?: string;
  readonly callID?: string;
  readonly state?: OpenCodeToolState;
  readonly filename?: string;
  readonly mime?: string;
  readonly url?: string;
  readonly files?: readonly string[];
  readonly reason?: string;
}

export interface OpenCodePartRecord {
  readonly id: string;
  readonly message_id: string;
  readonly time_created: number;
  readonly data: OpenCodePartData;
}

export interface OpenCodeSessionSnapshot {
  readonly harness: OpenCodeHarness;
  readonly format: OpenCodeSessionFormat;
  readonly session: OpenCodeSessionInfo;
  readonly messages: readonly OpenCodeMessageRecord[];
  readonly parts: readonly OpenCodePartRecord[];
}
