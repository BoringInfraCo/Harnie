import {
  codexSessionsRoots,
  isSessionHarness,
  openCodeDbCandidates,
  piSessionsRoot,
  scanHarness,
  SESSION_HARNESSES,
  type DiscoveryEnv,
  type HarnessScan,
  type SessionHarness,
} from "../discovery/session-locations.js";
import { emitJsonFailure, emitJsonSuccess } from "../contract/envelope.js";
import { FlagParseError, parseFlags } from "../contract/flags.js";

export interface RunSessionsOptions {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
  /** Injected env for tests; defaults to process.env. */
  readonly env?: DiscoveryEnv | undefined;
}

const usage = `Usage: harnie sessions [--harness pi|opencode|codex] [--json]

List local coding sessions available for import. Prints one line per
session: harness, session id, project, last update, and the exact
import command. Missing directories are skipped, never an error.

Scans known locations:
  pi        $PI_CODING_AGENT_SESSION_DIR, or ~/.pi/agent/sessions/
  codex     $CODEX_HOME/sessions/ and $CODEX_HOME/archived_sessions/
            (default ~/.codex)
  opencode  $XDG_DATA_HOME/opencode/opencode.db, then
            ~/.local/share/opencode/opencode.db
            (macOS fallback ~/Library/Application Support/opencode/opencode.db)
`;

export const runSessions = async (argv: string[], options: RunSessionsOptions): Promise<number> => {
  // JSON mode is decided by the presence of --json so that a failure early in
  // parsing (unknown flag, duplicate flag) still produces a JSON envelope.
  const json = argv.includes("--json");
  try {
    const parsed = parseFlags(argv, {
      "--harness": { kind: "value" },
      "--json": { kind: "switch" },
      "--help": { kind: "switch" },
      "-h": { kind: "switch" },
    });
    // Help short-circuits only after the argv passes flag validation.
    if (argv.includes("--help") || argv.includes("-h") || argv.includes("help")) {
      options.stdout.write(usage);
      return 0;
    }
    const harness = parsed.values["--harness"];
    if (harness !== undefined && !isSessionHarness(harness)) {
      const message = `Unknown harness "${harness}". Supported harnesses: pi, opencode, codex.`;
      if (json) return emitJsonFailure(options.stdout, "sessions", "invalid_input", message);
      options.stderr.write(`${message}\n${usage}`);
      return 1;
    }
    if (parsed.positionals.length > 0) {
      if (json) {
        return emitJsonFailure(
          options.stdout,
          "sessions",
          "usage",
          "harnie sessions takes no positional arguments.",
        );
      }
      options.stderr.write(usage);
      return 1;
    }

    const env = options.env ?? process.env;
    const harnesses: readonly SessionHarness[] =
      harness === undefined ? SESSION_HARNESSES : [harness];
    // Discovery never throws: per-harness scans degrade to empty results with hints.
    const scans = harnesses.map((name) => safeScan(name, env));

    if (json) {
      return emitJsonSuccess(options.stdout, "sessions", { scans: scans.map(scanData) });
    }

    for (const scan of scans) {
      if (scan.sessions.length > 0) {
        options.stdout.write(formatSessions(scan));
      } else {
        options.stdout.write(emptyHint(scan, env));
      }
      if (scan.omitted > 0) {
        options.stdout.write(
          `# ... and ${scan.omitted} older ${scan.harness} session(s) omitted (most recent shown).\n`,
        );
      }
    }
    return 0;
  } catch (error) {
    if (error instanceof FlagParseError) {
      if (json) return emitJsonFailure(options.stdout, "sessions", error.code, error.message);
      options.stderr.write(usage);
      return 1;
    }
    throw error;
  }
};

const safeScan = (harness: SessionHarness, env: DiscoveryEnv): HarnessScan => {
  try {
    return scanHarness(harness, env);
  } catch {
    return { harness, sessions: [], locations: [], omitted: 0 };
  }
};

const scanData = (scan: HarnessScan) => ({
  harness: scan.harness,
  locations: scan.locations,
  omitted: scan.omitted,
  sessions: scan.sessions.map((session) => ({
    harness: session.harness,
    sessionId: session.sessionId,
    project: session.project,
    updatedAt: session.updatedAt,
    importCommand: session.importCommand,
  })),
});

const formatSessions = (scan: HarnessScan): string => {
  const header = ["HARNESS", "SESSION", "PROJECT", "UPDATED", "IMPORT"] as const;
  const rows = scan.sessions.map((session) => [
    session.harness,
    session.sessionId,
    session.project,
    session.updatedAt,
    session.importCommand,
  ] as const);
  const widths = header.map((title, index) =>
    Math.max(title.length, ...rows.map((row) => (row[index] ?? "").length)),
  );
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, index) => cell.padEnd(widths[index] ?? 0))
      .join("  ")
      .trimEnd();
  return `${[line(header), ...rows.map((row) => line([...row]))].join("\n")}\n`;
};

const emptyHint = (scan: HarnessScan, env: DiscoveryEnv): string => {
  if (scan.harness === "pi") {
    const root = piSessionsRoot(env);
    return (
      `No pi sessions found in ${root}.\n` +
      `Pi stores sessions at ~/.pi/agent/sessions/--<project>--/<timestamp>_<id>.jsonl; ` +
      `import one with: harnie import pi <path>\n`
    );
  }
  if (scan.harness === "codex") {
    const roots = codexSessionsRoots(env).join(" or ");
    return (
      `No codex sessions found in ${roots}.\n` +
      `Codex stores rollouts at ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl; ` +
      `import one with: harnie import codex <path>\n`
    );
  }
  const candidates = openCodeDbCandidates(env);
  const scanned = scan.locations.length > 0 ? scan.locations.join(", ") : candidates.join(", ");
  return (
    `No opencode sessions found (checked ${scanned}).\n` +
    `OpenCode stores sessions in ~/.local/share/opencode/opencode.db; ` +
    `import one with: harnie import opencode <session-id>\n`
  );
};
