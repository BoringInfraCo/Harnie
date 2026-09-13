import { statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { diagnostic } from "../diagnostics.js";
import { asString, isJsonObject, type Diagnostic, type JsonObject, type JsonValue } from "../types.js";
import {
  GROK_HARNESS,
  GROK_SESSION_FORMAT,
  type GrokChatEntry,
  type GrokSession,
} from "./types.js";

export const GROK_CHAT_FILE = "chat_history.jsonl";
export const GROK_SUMMARY_FILE = "summary.json";

/**
 * Read a Grok session from either its session directory (the native storage
 * shape: `<dir>/chat_history.jsonl` plus a `summary.json` sidecar) or from a
 * `chat_history.jsonl` file directly (with the sibling `summary.json` used
 * when present). Never writes to the session directory.
 */
export const readGrokSessionPath = async (path: string): Promise<GrokSession> => {
  let isDirectory = false;
  try {
    isDirectory = statSync(path).isDirectory();
  } catch {
    // A missing path surfaces as ENOENT from readFile below, which the CLI
    // maps to an actionable "Session file not found" error.
    isDirectory = false;
  }
  const sessionDir = isDirectory ? path : dirname(path);
  const chatPath = isDirectory ? join(path, GROK_CHAT_FILE) : path;
  const text = await readFile(chatPath, "utf8");
  const summary = await readSummaryFile(join(sessionDir, GROK_SUMMARY_FILE));
  return readGrokSessionText(text, {
    path,
    chatPath,
    sessionDir,
    ...(summary ? { summary } : {}),
  });
};

interface GrokReadOptions {
  readonly path: string;
  readonly chatPath: string;
  readonly sessionDir: string;
  readonly summary?: JsonObject;
}

export const readGrokSessionText = (text: string, options: GrokReadOptions): GrokSession => {
  const { path, sessionDir, summary } = options;
  const entries: GrokChatEntry[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const [index, rawLine] of splitPhysicalLines(text).entries()) {
    const line = index + 1;
    if (rawLine.trim() === "") {
      diagnostics.push(diagnostic("empty_line", "warning", "Empty JSONL line.", { path, line }));
      continue;
    }
    let parsed: JsonValue;
    try {
      parsed = JSON.parse(rawLine) as JsonValue;
    } catch (error) {
      diagnostics.push(diagnostic("malformed_jsonl", "error", "Grok JSONL line is not valid JSON.", {
        path,
        line,
      }, { error: error instanceof Error ? error.message : String(error) }));
      continue;
    }
    if (!isJsonObject(parsed)) {
      diagnostics.push(diagnostic("non_object_jsonl", "error", "Grok JSONL line is not an object.", {
        path,
        line,
      }));
      continue;
    }
    const type = asString(parsed.type);
    if (type === undefined || type === "") {
      diagnostics.push(diagnostic("missing_type", "error", "Grok chat entry is missing type.", {
        path,
        line,
      }));
      continue;
    }
    entries.push({ type, line, record: parsed });
  }

  if (entries.length === 0) {
    throw new Error(withPath(
      `Grok session has no chat entries. Expected a Grok ${GROK_CHAT_FILE} transcript (one JSON object per line, e.g. {"type":"user",...}), e.g. ~/.grok/sessions/<project>/<session-id>/${GROK_CHAT_FILE}. Run "harnie sessions --harness grok" to list local sessions.`,
      path,
    ));
  }

  const sessionId = resolveSessionId(summary, sessionDir, options.chatPath);
  if (sessionId === undefined) {
    throw new Error(withPath(
      `Grok session id could not be determined. Import the session directory (which contains ${GROK_SUMMARY_FILE} with the session id) instead of a bare transcript file. Run "harnie sessions --harness grok" to list local sessions.`,
      path,
    ));
  }

  const cwd = summaryInfo(summary, "cwd");
  const startedAt = summaryString(summary, "created_at");
  const updatedAt = summaryString(summary, "updated_at");
  const model = summaryString(summary, "current_model_id") ?? firstAssistantModel(entries);
  if (summary === undefined) {
    diagnostics.push(diagnostic(
      "missing_summary",
      "warning",
      `Grok ${GROK_SUMMARY_FILE} sidecar not found; workspace, model, and timestamps fall back to transcript evidence.`,
      { path },
    ));
  }

  return {
    harness: GROK_HARNESS,
    format: GROK_SESSION_FORMAT,
    sessionId,
    entries,
    diagnostics,
    ...(cwd ? { cwd } : {}),
    ...(model ? { model } : {}),
    ...(startedAt ? { startedAt } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    sourceLocation: path,
  };
};

const readSummaryFile = async (path: string): Promise<JsonObject | undefined> => {
  try {
    const text = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(text);
    return isJsonObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const resolveSessionId = (
  summary: JsonObject | undefined,
  sessionDir: string,
  chatPath: string,
): string | undefined => {
  const fromSummary = summaryInfo(summary, "id");
  if (fromSummary) return fromSummary;
  // Without a summary sidecar the session id comes from the directory name,
  // which is reliable only in the native layout (`<session-id>/` imported as
  // a directory, or a `chat_history.jsonl` file inside it). A renamed bare
  // transcript elsewhere has no id to resolve and is rejected rather than
  // merged into a shared `unknown-session` work.
  const nativeFile = basename(chatPath) === GROK_CHAT_FILE;
  if (!nativeFile) return undefined;
  const base = basename(sessionDir);
  if (base !== "" && base !== "." && base !== ".." && base !== "/") {
    return base;
  }
  return undefined;
};

const summaryInfo = (summary: JsonObject | undefined, key: string): string | undefined => {
  if (!summary) return undefined;
  const info = summary.info;
  if (!isJsonObject(info)) return undefined;
  const value = asString(info[key]);
  return value !== undefined && value !== "" ? value : undefined;
};

const summaryString = (summary: JsonObject | undefined, key: string): string | undefined => {
  if (!summary) return undefined;
  const value = asString(summary[key]);
  return value !== undefined && value !== "" ? value : undefined;
};

const firstAssistantModel = (entries: readonly GrokChatEntry[]): string | undefined => {
  for (const entry of entries) {
    if (entry.type !== "assistant") continue;
    const model = asString(entry.record.model_id);
    if (model !== undefined && model !== "") return model;
  }
  return undefined;
};

const splitPhysicalLines = (text: string): string[] => {
  const lines = text.split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  return lines;
};

const withPath = (message: string, path: string): string => `${message} (${path})`;
