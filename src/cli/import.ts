import { existsSync, statSync } from "node:fs";
import {
  importCodexSessionFile,
  importOpenCodeSessionFile,
  importPiSessionFile,
} from "../engine/import.js";
import { importOpenCodeSessionFromDb } from "../opencode/import-db.js";
import { initHarnieStore, resolveHarnieHome } from "../store/database.js";
import { FlagParseError, parseFlags } from "../contract/flags.js";

export interface RunImportOptions {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

const usage =
  "Usage: harnie import pi <path> [--work <work>]\n       harnie import opencode <path> [--work <work>]\n       harnie import codex <path> [--work <work>]\nRun \"harnie sessions\" to list local sessions, or \"harnie import --help\" for per-harness paths.\n";

const importHelp = `Usage: harnie import pi <path> [--work <work>]
       harnie import opencode <path-or-session-id> [--work <work>]
       harnie import codex <path> [--work <work>]

Find sessions on this machine:
  harnie sessions [--harness pi|opencode|codex]

What counts as a valid import path:
  pi        A Pi session JSONL file: one JSON object per line whose first
            line is the session header, e.g. {"type":"session","version":3,...}.
            (Pi's native storage already is JSONL files, so they import directly.)
            Pi stores sessions at ~/.pi/agent/sessions/--<project>--/<timestamp>_<id>.jsonl
            Example: harnie import pi ~/.pi/agent/sessions/--my-proj--/2026-09-01T00-00-01-000Z_abc123.jsonl
  opencode  An OpenCode snapshot JSON file ({"harness":"opencode",
            "format":"opencode-session-v1",...}), or a live session id
            (ses_...) read from the local OpenCode database at
            ~/.local/share/opencode/opencode.db. (Live OpenCode sessions
            persist in SQLite session/message/part tables, not files, so a
            session id imports read-only via the bundled SQLite reader;
            the snapshot file is Harnie's portable shape for the same data.)
            Examples: harnie import opencode ./snapshot.json
                      harnie import opencode ses_abc123
  codex     A Codex rollout JSONL file: one JSON object per line whose first
            record is {"type":"session_meta",...}. (Codex's native storage
            already is JSONL rollout files, so they import directly.)
            Codex stores rollouts at ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl
            Example: harnie import codex ~/.codex/sessions/2026/09/07/rollout-2026-09-07T00-00-00-abc123.jsonl
`;

const OPENCODE_SESSION_ID_PATTERN = /^ses_[A-Za-z0-9]+$/;

const expectedFormatHint: Record<string, string> = {
  pi: 'Expected a Pi session JSONL file (first line {"type":"session","version":3,...}), e.g. ~/.pi/agent/sessions/--<project>--/<timestamp>_<id>.jsonl. Run "harnie sessions --harness pi" to list local sessions.',
  opencode:
    'Expected an OpenCode snapshot JSON file ({"harness":"opencode","format":"opencode-session-v1",...}) or a live session id (ses_...) from ~/.local/share/opencode/opencode.db. Run "harnie sessions --harness opencode" to list local sessions.',
  codex:
    'Expected a Codex rollout JSONL file (first record {"type":"session_meta",...}), e.g. ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl. Run "harnie sessions --harness codex" to list local sessions.',
};

export const runImport = async (argv: string[], options: RunImportOptions): Promise<number> => {
  // Strict parsing: unknown flags are rejected, never skipped; a duplicated
  // flag is rejected instead of silently keeping one value. Help short-circuits
  // only after the argv passes flag validation.
  let harness: string | undefined;
  let path: string | undefined;
  let workId: string | undefined;
  try {
    const parsed = parseFlags(argv, {
      "--work": { kind: "value" },
      "--help": { kind: "switch" },
      "-h": { kind: "switch" },
    });
    if (argv.includes("--help") || argv.includes("-h") || argv.includes("help")) {
      options.stdout.write(importHelp);
      return 0;
    }
    if (parsed.positionals.length > 2) {
      options.stderr.write(usage);
      return 1;
    }
    harness = parsed.positionals[0];
    path = parsed.positionals[1];
    workId = parsed.values["--work"];
  } catch (error) {
    if (error instanceof FlagParseError) {
      options.stderr.write(`${error.message}\n${usage}`);
      return 1;
    }
    throw error;
  }

  if (harness === undefined || harness === "") {
    options.stderr.write(usage);
    return 1;
  }

  if (harness !== "pi" && harness !== "opencode" && harness !== "codex") {
    options.stderr.write(
      `Harness "${harness}" is not implemented. Supported harnesses: pi, opencode, codex.\n`,
    );
    return 1;
  }

  if (path === undefined || path === "") {
    options.stderr.write(usage);
    return 1;
  }

  try {
    const home = resolveHarnieHome(options.home ?? process.env.HARNIE_HOME);
    const store = initHarnieStore({ home });
    try {
      const attach = workId !== undefined ? { workId } : undefined;
      if (harness === "opencode" && isLiveOpenCodeSessionId(path)) {
        const result = importOpenCodeSessionFromDb(store, path, attach);
        options.stdout.write(
          `Imported ${harness} session.\n\nWork\n${result.workId}\nEvents inserted\n${result.eventsInserted}\n`,
        );
        return 0;
      }
      const result =
        harness === "codex"
          ? await importCodexSessionFile(store, path, attach)
          : harness === "opencode"
            ? await importOpenCodeSessionFile(store, path, attach)
            : await importPiSessionFile(store, path, attach);
      options.stdout.write(
        `Imported ${harness} session.\n\nWork\n${result.workId}\nEvents inserted\n${result.eventsInserted}\n`,
      );
      return 0;
    } finally {
      store.close();
    }
  } catch (error) {
    options.stderr.write(`${actionableImportError(harness, path, error)}\n`);
    return 1;
  }
};

/**
 * An opencode argument is treated as a live session id (read from the local
 * OpenCode SQLite database) when it looks like one and does not name an
 * existing file. Snapshot files keep working exactly as before.
 */
const isLiveOpenCodeSessionId = (path: string): boolean => {
  if (!OPENCODE_SESSION_ID_PATTERN.test(path)) return false;
  try {
    return !existsSync(path) || !statSync(path).isFile();
  } catch {
    return true;
  }
};

const actionableImportError = (harness: string, path: string, error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (/^Work not found: /.test(message)) return message;
  if (isMissingFileError(error)) {
    return `Session file not found: ${path}\nRun "harnie sessions" to list importable local sessions.`;
  }
  const hint = expectedFormatHint[harness];
  if (hint && !message.includes("harnie sessions")) return `${message}\n${hint}`;
  return message;
};

const isMissingFileError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code?: unknown }).code === "ENOENT";
