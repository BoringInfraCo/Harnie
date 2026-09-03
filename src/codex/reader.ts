import { readFile } from "node:fs/promises";
import { diagnostic } from "../diagnostics.js";
import { asString, isJsonObject, type Diagnostic, type JsonObject, type JsonValue } from "../types.js";
import {
  CODEX_HARNESS,
  CODEX_SESSION_FORMAT,
  type CodexRollout,
  type CodexRolloutRecord,
} from "./types.js";

export const readCodexJsonlFile = async (path: string): Promise<CodexRollout> => {
  const text = await readFile(path, "utf8");
  return readCodexJsonlText(text, path);
};

export const readCodexJsonlText = (text: string, path?: string): CodexRollout => {
  const physicalLines = splitPhysicalLines(text);
  const records: CodexRolloutRecord[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const [index, rawLine] of physicalLines.entries()) {
    const line = index + 1;

    if (rawLine.trim() === "") {
      diagnostics.push(diagnostic("empty_line", "warning", "Empty JSONL line.", { path, line }));
      continue;
    }

    let parsed: JsonValue;
    try {
      parsed = JSON.parse(rawLine) as JsonValue;
    } catch (error) {
      diagnostics.push(diagnostic("malformed_jsonl", "error", "Codex JSONL line is not valid JSON.", {
        path,
        line,
      }, { error: error instanceof Error ? error.message : String(error) }));
      continue;
    }

    if (!isJsonObject(parsed)) {
      diagnostics.push(diagnostic("non_object_jsonl", "error", "Codex JSONL line is not an object.", {
        path,
        line,
      }));
      continue;
    }

    const type = asString(parsed.type);
    if (type === undefined) {
      diagnostics.push(diagnostic("missing_type", "error", "Codex JSONL record is missing type.", {
        path,
        line,
      }));
      continue;
    }

    if (!isJsonObject(parsed.payload)) {
      diagnostics.push(diagnostic("missing_payload", "error", "Codex JSONL record is missing payload.", {
        path,
        line,
      }));
      continue;
    }

    const timestamp = asString(parsed.timestamp);
    records.push({
      type,
      payload: parsed.payload,
      line,
      ...(timestamp ? { timestamp } : {}),
    });
  }

  if (records.length === 0) {
    throw new Error(withPath("Codex rollout has no session_meta and no valid objects.", path));
  }

  const header = records[0]!;
  if (header.type !== "session_meta") {
    throw new Error(withPath("Codex rollout first record must be session_meta.", path));
  }

  const sessionId = asString(header.payload.id);
  if (sessionId === undefined || sessionId === "") {
    throw new Error(withPath("Codex rollout is missing session_meta.id.", path));
  }

  const cwd = asString(header.payload.cwd);
  const source = asString(header.payload.source);
  const startedAt = header.timestamp ?? asString(header.payload.timestamp);
  const model = firstTurnContextModel(records);

  return {
    harness: CODEX_HARNESS,
    format: CODEX_SESSION_FORMAT,
    sessionId,
    records,
    diagnostics,
    ...(cwd ? { cwd } : {}),
    ...(model ? { model } : {}),
    ...(source ? { source } : {}),
    ...(startedAt ? { startedAt } : {}),
  };
};

const firstTurnContextModel = (records: readonly CodexRolloutRecord[]): string | undefined => {
  for (const record of records) {
    if (record.type !== "turn_context") continue;
    const model = asString(record.payload.model);
    if (model !== undefined && model !== "") return model;
  }
  return undefined;
};

const splitPhysicalLines = (text: string): string[] => {
  const lines = text.split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  return lines;
};

const withPath = (message: string, path?: string): string =>
  path === undefined ? message : `${message} (${path})`;
