import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderOpenCodeHandoff } from "../handoff/opencode.js";
import { renderPiHandoff } from "../handoff/pi.js";
import { initHarnieStore, resolveHarnieHome } from "../store/database.js";
import { loadWork } from "../store/persist.js";
import { buildHandoffFromWork } from "../work/handoff.js";

export interface RunHandoffOptions {
  readonly home?: string;
  readonly stdout: { write(chunk: string): unknown };
  readonly stderr: { write(chunk: string): unknown };
}

type HandoffTarget = "opencode" | "pi";

const usage = "Usage: harnie handoff <work> --to <target>\n";

export const runHandoff = async (argv: string[], options: RunHandoffOptions): Promise<number> => {
  const workId = firstNonFlag(argv);
  const target = flagValue(argv, "--to");

  if (workId === undefined || workId === "" || target === undefined) {
    options.stderr.write(usage);
    return 1;
  }

  if (!isHandoffTarget(target)) {
    options.stderr.write(`Target "${target}" is not implemented.\n`);
    return 1;
  }

  try {
    const home = resolveHarnieHome(options.home ?? process.env.HARNIE_HOME);
    const store = initHarnieStore({ home });
    try {
      const work = loadWork(store, workId);
      if (work === undefined) {
        options.stderr.write(`Work not found: ${workId}\n`);
        return 1;
      }

      const handoff = buildHandoffFromWork(work);
      const markdown = target === "pi" ? renderPiHandoff(handoff) : renderOpenCodeHandoff(handoff);
      options.stdout.write(markdown);
      writeHandoffFile(home, work.id, markdown, target);
      return 0;
    } finally {
      store.close();
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.stderr.write(`${message}\n`);
    return 1;
  }
};

const isHandoffTarget = (value: string): value is HandoffTarget =>
  value === "opencode" || value === "pi";

const firstNonFlag = (argv: readonly string[]): string | undefined => {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined || arg.startsWith("-")) {
      if (arg === "--to") index += 1;
      continue;
    }
    return arg;
  }
  return undefined;
};

const flagValue = (argv: readonly string[], flag: string): string | undefined => {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  return argv[index + 1];
};

const writeHandoffFile = (
  home: string,
  workId: string,
  markdown: string,
  target: HandoffTarget,
): void => {
  const directory = join(home, "handoffs");
  mkdirSync(directory, { recursive: true });
  const suffix = target === "pi" ? ".pi.md" : ".md";
  writeFileSync(join(directory, `${safeWorkId(workId)}${suffix}`), markdown);
};

const safeWorkId = (workId: string): string => {
  const safe = workId.replace(/[^A-Za-z0-9._-]+/g, "_");
  return safe === "" ? "work" : safe;
};
