#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runHandoff } from "./cli/handoff.js";
import { runImport } from "./cli/import.js";
import { runInit } from "./cli/init.js";
import { runList } from "./cli/list.js";
import { runShow } from "./cli/show.js";

export interface CliWriter {
  write(chunk: string): unknown;
}

export interface RunCliOptions {
  readonly home?: string;
  readonly stdout?: CliWriter;
  readonly stderr?: CliWriter;
}

const usage = `Usage: harnie <command>

Commands:
  init              Create the Harnie home directory and SQLite store
  import pi <path>  Import a Pi session as observed Work
  import opencode <path>
                    Import an OpenCode session as observed Work
  import codex <path>
                    Import a Codex rollout as observed Work
  list              List persisted observed Work
  show <work>       Show observed Work
  handoff <work> --to opencode
                    Write an OpenCode continuation handoff
  handoff <work> --to pi
                    Write a Pi continuation handoff
`;

export const runCli = async (argv: string[], options?: RunCliOptions): Promise<number> => {
  const stdout = options?.stdout ?? process.stdout;
  const stderr = options?.stderr ?? process.stderr;
  const command = argv[0];

  if (command === undefined || command === "") {
    stderr.write(usage);
    return 1;
  }

  if (command === "--help" || command === "-h" || command === "help") {
    stdout.write(usage);
    return 0;
  }

  const io = {
    stdout,
    stderr,
    ...(options?.home !== undefined ? { home: options.home } : {}),
  };

  if (command === "init") {
    return runInit(io);
  }

  if (command === "import") {
    return runImport(argv.slice(1), io);
  }

  if (command === "list") {
    return runList(io);
  }

  if (command === "show") {
    return runShow(argv.slice(1), io);
  }

  if (command === "handoff") {
    return runHandoff(argv.slice(1), io);
  }

  stderr.write(`Unknown command: ${command}\n`);
  return 1;
};

const isCliEntry = (): boolean => {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(entry));
  } catch {
    return import.meta.url === pathToFileURL(resolve(entry)).href;
  }
};

if (isCliEntry()) {
  void runCli(process.argv.slice(2)).then(
    (code) => {
      process.exit(code);
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exit(1);
    },
  );
}
