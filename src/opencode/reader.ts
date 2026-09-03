import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { asString, isJsonObject, type JsonObject, type JsonValue } from "../types.js";
import {
  OPENCODE_HARNESS,
  OPENCODE_SESSION_FORMAT,
  type OpenCodeMessageData,
  type OpenCodeModelRef,
  type OpenCodePartData,
  type OpenCodeSessionSnapshot,
} from "./types.js";

export type {
  OpenCodeHarness,
  OpenCodeMessageData,
  OpenCodeMessageRecord,
  OpenCodeModelRef,
  OpenCodePartData,
  OpenCodePartRecord,
  OpenCodePartType,
  OpenCodeSessionFormat,
  OpenCodeSessionInfo,
  OpenCodeSessionSnapshot,
  OpenCodeToolInput,
  OpenCodeToolState,
  OpenCodeToolStatus,
} from "./types.js";
export { OPENCODE_HARNESS, OPENCODE_SESSION_FORMAT } from "./types.js";

interface SessionRow {
  id: string;
  directory: string;
  title: string;
  agent: string | null;
  model: string | null;
  version: string | null;
  time_created: number;
  time_updated: number;
}

interface MessageRow {
  id: string;
  time_created: number;
  data: string;
}

interface PartRow {
  id: string;
  message_id: string;
  time_created: number;
  data: string;
}

export const readOpenCodeSnapshotFile = async (path: string): Promise<OpenCodeSessionSnapshot> => {
  const text = await readFile(path, "utf8");
  return readOpenCodeSnapshotText(text, path);
};

export const readOpenCodeSnapshotText = (text: string, path?: string): OpenCodeSessionSnapshot => {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(text) as JsonValue;
  } catch (error) {
    throw new Error(withPath("Invalid OpenCode snapshot JSON.", path, error));
  }

  if (!isJsonObject(parsed)) {
    throw new Error(withPath("OpenCode snapshot is not an object.", path));
  }
  if (parsed.harness !== OPENCODE_HARNESS) {
    throw new Error(withPath(`OpenCode snapshot harness must be "${OPENCODE_HARNESS}".`, path));
  }
  if (parsed.format !== OPENCODE_SESSION_FORMAT) {
    throw new Error(withPath(`OpenCode snapshot format must be "${OPENCODE_SESSION_FORMAT}".`, path));
  }
  if (!isJsonObject(parsed.session)) {
    throw new Error(withPath("OpenCode snapshot is missing session.id.", path));
  }
  const sessionId = asString(parsed.session.id);
  if (sessionId === undefined || sessionId === "") {
    throw new Error(withPath("OpenCode snapshot is missing session.id.", path));
  }
  if (!Array.isArray(parsed.messages)) {
    throw new Error(withPath("OpenCode snapshot messages must be an array.", path));
  }
  if (!Array.isArray(parsed.parts)) {
    throw new Error(withPath("OpenCode snapshot parts must be an array.", path));
  }

  return parsed as unknown as OpenCodeSessionSnapshot;
};

export const readOpenCodeSqliteFile = (dbPath: string, sessionId: string): OpenCodeSessionSnapshot => {
  if (!existsSync(dbPath)) {
    throw new Error(`OpenCode SQLite file not found: ${dbPath}`);
  }
  if (sessionId === "") {
    throw new Error("OpenCode session id is required.");
  }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return loadSqliteSnapshot(db, sessionId);
  } finally {
    db.close();
  }
};

const loadSqliteSnapshot = (db: DatabaseSync, sessionId: string): OpenCodeSessionSnapshot => {
  const sessionRow = db.prepare(`
    SELECT id, directory, title, agent, model, version, time_created, time_updated
    FROM session
    WHERE id = ?
  `).get(sessionId) as unknown as SessionRow | undefined;

  if (sessionRow === undefined) {
    throw new Error(`OpenCode session not found: ${sessionId}`);
  }

  const messageRows = db.prepare(`
    SELECT id, time_created, data
    FROM message
    WHERE session_id = ?
    ORDER BY time_created, id
  `).all(sessionId) as unknown as MessageRow[];

  const partRows = db.prepare(`
    SELECT id, message_id, time_created, data
    FROM part
    WHERE session_id = ?
    ORDER BY time_created, id
  `).all(sessionId) as unknown as PartRow[];

  const model = parseModel(sessionRow.model);
  return {
    harness: OPENCODE_HARNESS,
    format: OPENCODE_SESSION_FORMAT,
    session: {
      id: sessionRow.id,
      directory: sessionRow.directory,
      title: sessionRow.title,
      ...(sessionRow.agent ? { agent: sessionRow.agent } : {}),
      ...(model ? { model } : {}),
      ...(sessionRow.version ? { version: sessionRow.version } : {}),
      time_created: sessionRow.time_created,
      time_updated: sessionRow.time_updated,
    },
    messages: messageRows.map((row) => ({
      id: row.id,
      time_created: row.time_created,
      data: parseJsonObject(row.data, `message ${row.id}`) as unknown as OpenCodeMessageData,
    })),
    parts: partRows.map((row) => ({
      id: row.id,
      message_id: row.message_id,
      time_created: row.time_created,
      data: parseJsonObject(row.data, `part ${row.id}`) as unknown as OpenCodePartData,
    })),
  };
};

const parseModel = (raw: string | null): OpenCodeModelRef | undefined => {
  if (raw === null || raw === "") return undefined;
  try {
    const parsed = JSON.parse(raw) as JsonValue;
    if (!isJsonObject(parsed)) return undefined;
    const id = asString(parsed.id);
    const providerID = asString(parsed.providerID);
    if (id === undefined || providerID === undefined) return undefined;
    return { id, providerID };
  } catch {
    return undefined;
  }
};

const parseJsonObject = (raw: string, label: string): JsonObject => {
  try {
    const parsed = JSON.parse(raw) as JsonValue;
    if (!isJsonObject(parsed)) {
      throw new Error(`OpenCode ${label} data is not an object.`);
    }
    return parsed;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("OpenCode ")) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`OpenCode ${label} data is not valid JSON: ${detail}`);
  }
};

const withPath = (message: string, path?: string, error?: unknown): string => {
  const detail = error === undefined
    ? undefined
    : error instanceof Error
      ? error.message
      : String(error);
  const suffix = path === undefined ? "" : ` (${path})`;
  return detail ? `${message}${suffix} ${detail}` : `${message}${suffix}`;
};
