import { diagnostic } from "./diagnostics.js";
import type { Diagnostic, SourceRecord } from "../types.js";

export interface ValidatePiGraphResult {
  readonly diagnostics: readonly Diagnostic[];
}

export const validatePiGraph = (records: readonly SourceRecord[]): ValidatePiGraphResult => {
  const diagnostics: Diagnostic[] = [];
  const entries = records.filter((record) => isGraphEntry(record));
  const byId = new Map<string, SourceRecord[]>();

  for (const record of entries) {
    if (!record.entryId) {
      diagnostics.push(diagnostic("missing_entry_id", "error", "Non-header Pi record is missing an entry id.", location(record)));
      continue;
    }

    const existing = byId.get(record.entryId) ?? [];
    existing.push(record);
    byId.set(record.entryId, existing);

    if (!isIsoTimestamp(record.timestamp)) {
      diagnostics.push(diagnostic("malformed_timestamp", "warning", "Pi record timestamp is missing or not an ISO timestamp string.", location(record)));
    }

    if (!("parentId" in record)) {
      diagnostics.push(diagnostic("missing_parent_id", "error", "Non-header Pi record is missing parentId.", location(record)));
    } else if (record.parentId !== null && typeof record.parentId !== "string") {
      diagnostics.push(diagnostic("malformed_parent_id", "error", "Pi parentId must be null or a string.", location(record)));
    } else if (record.parentId === record.entryId) {
      diagnostics.push(diagnostic("self_parent", "error", "Pi record parentId points to itself.", location(record)));
    }
  }

  for (const [entryId, duplicates] of byId) {
    if (duplicates.length > 1) {
      for (const record of duplicates) {
        diagnostics.push(diagnostic("duplicate_entry_id", "error", "Entry id appears more than once in the session.", location(record), { entryId }));
      }
    }
  }

  for (const record of entries) {
    if (record.parentId && !byId.has(record.parentId)) {
      diagnostics.push(diagnostic("orphan_parent", "error", "Pi record parentId does not reference an observed entry.", location(record), { parentId: record.parentId }));
    }
  }

  diagnostics.push(...detectCycles(entries, byId));
  return { diagnostics };
};

const isGraphEntry = (record: SourceRecord): boolean =>
  !(record.source.family === "pi-session-v3" && record.sourceType === "session") &&
  !(record.source.family === "pi-session-v4" && record.sourceType === "header");

const isIsoTimestamp = (value: string | undefined): boolean =>
  typeof value === "string" && !Number.isNaN(Date.parse(value));

const location = (record: SourceRecord) => ({
  path: record.source.path,
  line: record.line,
  entryId: record.entryId,
});

const detectCycles = (
  entries: readonly SourceRecord[],
  byId: ReadonlyMap<string, readonly SourceRecord[]>,
): Diagnostic[] => {
  const unique = entries.filter((record) => record.entryId && byId.get(record.entryId)?.length === 1);
  const byUniqueId = new Map(unique.map((record) => [record.entryId as string, record]));
  const diagnostics: Diagnostic[] = [];
  const globallyReported = new Set<string>();

  for (const start of unique) {
    const seen = new Map<string, SourceRecord>();
    let current: SourceRecord | undefined = start;

    while (current?.entryId && current.parentId) {
      if (seen.has(current.entryId)) {
        for (const [entryId, record] of seen) {
          if (!globallyReported.has(entryId)) {
            globallyReported.add(entryId);
            diagnostics.push(diagnostic("parent_cycle", "error", "Pi parent graph contains a cycle.", location(record)));
          }
        }
        break;
      }
      seen.set(current.entryId, current);
      current = byUniqueId.get(current.parentId);
    }
  }

  return diagnostics;
};
