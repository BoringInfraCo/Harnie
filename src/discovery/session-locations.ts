import { existsSync, openSync, closeSync, readSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SessionHarness = "pi" | "opencode" | "codex";

export const SESSION_HARNESSES: readonly SessionHarness[] = ["pi", "opencode", "codex"];

export const isSessionHarness = (value: string): value is SessionHarness =>
  value === "pi" || value === "opencode" || value === "codex";

/** String map compatible with process.env; kept abstract so tests can inject a fake env. */
export type DiscoveryEnv = Record<string, string | undefined>;

const MAX_SESSIONS_PER_HARNESS = 200;

export interface DiscoveredSession {
  readonly harness: SessionHarness;
  /** File base name (pi/codex) or live session id (opencode). Display only; import uses importCommand. */
  readonly sessionId: string;
  /** Project directory or label when known, otherwise "-". */
  readonly project: string;
  /** ISO timestamp when known, otherwise "-". */
  readonly updatedAt: string;
  /** Exact copy-pasteable command that imports this session. */
  readonly importCommand: string;
}

export interface HarnessScan {
  readonly harness: SessionHarness;
  readonly sessions: readonly DiscoveredSession[];
  /** Locations that were scanned (roots or db path), for hints and debugging. */
  readonly locations: readonly string[];
  /** Older sessions omitted by the per-harness cap. */
  readonly omitted: number;
}

/**
 * Home directory used for discovery. HARNIE_DISCOVERY_HOME is a test seam so
 * regression tests can point discovery at fixture homes instead of the real
 * machine state; it is intentionally not advertised in CLI help output.
 */
export const resolveDiscoveryHome = (env: DiscoveryEnv = process.env): string => {
  const override = env.HARNIE_DISCOVERY_HOME;
  if (override !== undefined && override !== "") return override;
  return env.HOME && env.HOME !== "" ? env.HOME : homedir();
};

/** Pi session root: explicit override, config-dir override, then the documented default. */
export const piSessionsRoot = (env: DiscoveryEnv = process.env): string => {
  const explicit = env.PI_CODING_AGENT_SESSION_DIR;
  if (explicit !== undefined && explicit !== "") return explicit;
  const home = resolveDiscoveryHome(env);
  const configDir = env.PI_CODING_AGENT_DIR;
  if (configDir !== undefined && configDir !== "") return join(configDir, "agent", "sessions");
  return join(home, ".pi", "agent", "sessions");
};

/** Codex state home; CODEX_HOME relocates everything Codex persists. */
export const codexHome = (env: DiscoveryEnv = process.env): string => {
  const override = env.CODEX_HOME;
  if (override !== undefined && override !== "") return override;
  return join(resolveDiscoveryHome(env), ".codex");
};

/** Codex rollout roots: active date-partitioned sessions plus the archive directory. */
export const codexSessionsRoots = (env: DiscoveryEnv = process.env): readonly string[] => {
  const home = codexHome(env);
  return [join(home, "sessions"), join(home, "archived_sessions")];
};

/**
 * Candidate OpenCode databases, most specific first. The XDG data-home layout
 * is canonical; the macOS Application Support layout is a fallback for
 * non-XDG installs.
 */
export const openCodeDbCandidates = (env: DiscoveryEnv = process.env): readonly string[] => {
  const home = resolveDiscoveryHome(env);
  const candidates: string[] = [];
  const xdg = env.XDG_DATA_HOME;
  if (xdg !== undefined && xdg !== "") candidates.push(join(xdg, "opencode", "opencode.db"));
  candidates.push(join(home, ".local", "share", "opencode", "opencode.db"));
  candidates.push(join(home, "Library", "Application Support", "opencode", "opencode.db"));
  return candidates;
};

/** First candidate database that exists on disk, if any. */
export const findOpenCodeDatabase = (env: DiscoveryEnv = process.env): string | undefined =>
  openCodeDbCandidates(env).find((candidate) => {
    try {
      return existsSync(candidate) && statSync(candidate).isFile();
    } catch {
      return false;
    }
  });

export const quotePath = (path: string): string => `"${path.replace(/"/g, '\\"')}"`;

const isoFromMtime = (path: string): string => {
  try {
    return new Date(statSync(path).mtimeMs).toISOString();
  } catch {
    return "-";
  }
};

const isoFromEpochMs = (value: unknown): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  try {
    return new Date(value).toISOString();
  } catch {
    return "-";
  }
};

/** Pi sessions are JSONL files grouped by working directory: <root>/--<path>--/*.jsonl */
export const scanPiSessions = (root: string): HarnessScan => {
  const sessions: DiscoveredSession[] = [];
  let projects = 0;
  try {
    for (const project of readdirSync(root, { withFileTypes: true })) {
      if (!project.isDirectory()) continue;
      projects += 1;
      let files: string[] = [];
      try {
        files = readdirSync(join(root, project.name)).filter((name) => name.endsWith(".jsonl"));
      } catch {
        continue;
      }
      for (const file of files) {
        const path = join(root, project.name, file);
        try {
          if (!statSync(path).isFile()) continue;
        } catch {
          continue;
        }
        sessions.push({
          harness: "pi",
          sessionId: file.replace(/\.jsonl$/, ""),
          project: project.name,
          updatedAt: isoFromMtime(path),
          importCommand: `harnie import pi ${quotePath(path)}`,
        });
      }
    }
  } catch {
    return { harness: "pi", sessions: [], locations: [root], omitted: 0 };
  }
  void projects;
  return finalize("pi", [root], sessions);
};

/** Codex rollouts are JSONL files under date-partitioned (or archive) directories. */
export const scanCodexSessions = (roots: readonly string[]): HarnessScan => {
  const sessions: DiscoveredSession[] = [];
  for (const root of roots) {
    for (const path of walkJsonl(root)) {
      const meta = readCodexSessionMeta(path);
      sessions.push({
        harness: "codex",
        sessionId: meta.sessionId ?? path.split("/").at(-1)?.replace(/\.jsonl$/, "") ?? path,
        project: meta.cwd ?? "-",
        updatedAt: isoFromMtime(path),
        importCommand: `harnie import codex ${quotePath(path)}`,
      });
    }
  }
  return finalize("codex", roots, sessions);
};

/**
 * OpenCode sessions live in SQLite (session/message/part tables), not in
 * per-session files, so listing reads the database read-only. Never throws:
 * a missing or unreadable database yields an empty scan with locations set.
 */
export const scanOpenCodeSessions = (dbPath: string | undefined): HarnessScan => {
  if (dbPath === undefined) return { harness: "opencode", sessions: [], locations: [], omitted: 0 };
  let db: DatabaseSync | undefined;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const rows = db
      .prepare("SELECT id, directory, time_updated FROM session ORDER BY time_updated DESC")
      .all() as unknown as Array<{ id: unknown; directory: unknown; time_updated: unknown }>;
    const sessions = rows
      .filter((row) => typeof row.id === "string" && row.id !== "")
      .map((row) => {
        const id = row.id as string;
        return {
          harness: "opencode" as const,
          sessionId: id,
          project: typeof row.directory === "string" && row.directory !== "" ? row.directory : "-",
          updatedAt: isoFromEpochMs(row.time_updated),
          importCommand: `harnie import opencode ${id}`,
        };
      });
    return finalize("opencode", [dbPath], sessions);
  } catch {
    return { harness: "opencode", sessions: [], locations: [dbPath], omitted: 0 };
  } finally {
    try {
      db?.close();
    } catch {
      // Ignore close errors on a best-effort read-only handle.
    }
  }
};

export const scanHarness = (
  harness: SessionHarness,
  env: DiscoveryEnv = process.env,
): HarnessScan => {
  if (harness === "pi") return scanPiSessions(piSessionsRoot(env));
  if (harness === "codex") return scanCodexSessions(codexSessionsRoots(env));
  return scanOpenCodeSessions(findOpenCodeDatabase(env));
};

export const scanAllHarnesses = (env: DiscoveryEnv = process.env): readonly HarnessScan[] =>
  SESSION_HARNESSES.map((harness) => scanHarness(harness, env));

const finalize = (
  harness: SessionHarness,
  locations: readonly string[],
  sessions: DiscoveredSession[],
): HarnessScan => {
  const ordered = [...sessions].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const omitted = Math.max(0, ordered.length - MAX_SESSIONS_PER_HARNESS);
  return { harness, sessions: ordered.slice(0, MAX_SESSIONS_PER_HARNESS), locations, omitted };
};

const walkJsonl = (root: string): string[] => {
  const found: string[] = [];
  const visit = (dir: string): void => {
    let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(".jsonl")) {
        found.push(path);
      }
    }
  };
  try {
    if (!statSync(root).isDirectory()) return [];
  } catch {
    return [];
  }
  visit(root);
  return found;
};

/**
 * Best-effort metadata peek at a Codex rollout file: parses only the first
 * non-empty line (session_meta) for the session id and working directory.
 * Reads incrementally up to a cap so large session_meta lines (which can
 * embed instructions) still resolve. Never throws and never reads beyond
 * the first line.
 */
const readCodexSessionMeta = (path: string): { sessionId?: string; cwd?: string } => {
  let fd = -1;
  try {
    fd = openSync(path, "r");
    const chunks: Buffer[] = [];
    const step = 8192;
    let total = 0;
    for (;;) {
      const buffer = Buffer.alloc(step);
      const bytes = readSync(fd, buffer, 0, buffer.length, total);
      if (bytes === 0) break;
      chunks.push(buffer.subarray(0, bytes));
      total += bytes;
      if (buffer.subarray(0, bytes).includes("\n") || total >= 262144) break;
    }
    const firstLine = Buffer.concat(chunks)
      .toString("utf8")
      .split(/\r?\n/u)
      .find((line) => line.trim() !== "");
    if (!firstLine) return {};
    const parsed: unknown = JSON.parse(firstLine);
    if (typeof parsed !== "object" || parsed === null) return {};
    const record = parsed as { type?: unknown; payload?: unknown };
    if (record.type !== "session_meta" || typeof record.payload !== "object" || record.payload === null) {
      return {};
    }
    const payload = record.payload as { id?: unknown; cwd?: unknown };
    return {
      ...(typeof payload.id === "string" && payload.id !== "" ? { sessionId: payload.id } : {}),
      ...(typeof payload.cwd === "string" && payload.cwd !== "" ? { cwd: payload.cwd } : {}),
    };
  } catch {
    return {};
  } finally {
    if (fd !== -1) {
      try {
        closeSync(fd);
      } catch {
        // Ignore close errors on a best-effort peek.
      }
    }
  }
};
