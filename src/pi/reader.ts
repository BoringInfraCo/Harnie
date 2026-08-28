import { readFile } from "node:fs/promises";
import { diagnostic } from "./diagnostics.js";
import { detectPiSourceFamilyFromHeader, sessionIdFromHeader } from "./detect.js";
import type {
  Diagnostic,
  JsonObject,
  JsonValue,
  MalformedSourceLine,
  PiSourceDescriptor,
  SourceRecord,
} from "../types.js";
import { asString, isJsonObject } from "../types.js";

export interface ReadPiJsonlResult {
  readonly source: PiSourceDescriptor;
  readonly records: readonly SourceRecord[];
  readonly malformedLines: readonly MalformedSourceLine[];
  readonly diagnostics: readonly Diagnostic[];
}

export const readPiJsonlFile = async (path: string): Promise<ReadPiJsonlResult> => {
  const text = await readFile(path, "utf8");
  return readPiJsonlText(text, path);
};

export const readPiJsonlText = (text: string, path?: string): ReadPiJsonlResult => {
  const physicalLines = splitPhysicalLines(text);
  const parsed: Array<{ line: number; rawLine: string; raw: JsonObject }> = [];
  const malformedLines: MalformedSourceLine[] = [];
  const diagnostics: Diagnostic[] = [];

  for (const [index, rawLine] of physicalLines.entries()) {
    const line = index + 1;

    if (rawLine.trim() === "") {
      const diag = diagnostic("empty_line", "warning", "Empty JSONL line.", { path, line });
      diagnostics.push(diag);
      malformedLines.push({ line, rawLine, diagnostics: [diag] });
      continue;
    }

    try {
      const raw = JSON.parse(rawLine) as JsonValue;
      if (!isJsonObject(raw)) {
        const diag = diagnostic("non_object_jsonl", "error", "Pi JSONL line is not an object.", {
          path,
          line,
        });
        diagnostics.push(diag);
        malformedLines.push({ line, rawLine, diagnostics: [diag] });
        continue;
      }
      parsed.push({ line, rawLine, raw });
    } catch (error) {
      const diag = diagnostic("malformed_jsonl", "error", "Pi JSONL line is not valid JSON.", {
        path,
        line,
      }, { error: error instanceof Error ? error.message : String(error) });
      diagnostics.push(diag);
      malformedLines.push({ line, rawLine, diagnostics: [diag] });
    }
  }

  const header = parsed[0]?.raw;
  const family = detectPiSourceFamilyFromHeader(header);
  const sessionId = sessionIdFromHeader(header);
  const source: PiSourceDescriptor = { harness: "pi", family, ...(sessionId ? { sessionId } : {}), ...(path ? { path } : {}) };

  if (parsed.length === 0) {
    diagnostics.push(diagnostic("empty_session", "warning", "No valid JSON object records found.", { path }));
  } else if (family === "unknown") {
    diagnostics.push(diagnostic("unsupported_source_family", "warning", "Pi source family could not be identified from the header.", { path, line: parsed[0]!.line }));
  }

  const records = parsed.map(({ line, rawLine, raw }) => toSourceRecord(source, line, rawLine, raw));
  return { source, records, malformedLines, diagnostics };
};

const splitPhysicalLines = (text: string): string[] => {
  const lines = text.split(/\r?\n/u);
  if (lines.at(-1) === "") lines.pop();
  return lines;
};

const toSourceRecord = (
  source: PiSourceDescriptor,
  line: number,
  rawLine: string,
  raw: JsonObject,
): SourceRecord => {
  const sourceType = asString(raw.type) ?? asString(raw.kind);
  const entryId = asString(raw.id);
  const parentId = raw.parentId === null || typeof raw.parentId === "string" ? raw.parentId : undefined;
  const timestamp = asString(raw.timestamp) ?? asString(raw.createdAt);

  return {
    source,
    line,
    rawLine,
    raw,
    ...(sourceType ? { sourceType } : {}),
    ...(entryId ? { entryId } : {}),
    ...(parentId !== undefined ? { parentId } : {}),
    ...(timestamp ? { timestamp } : {}),
    diagnostics: [],
  };
};
