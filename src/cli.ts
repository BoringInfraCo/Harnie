#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runBackup, runRestore } from "./cli/backup.js";
import { runCheckpoint } from "./cli/checkpoint.js";
import { runDiff } from "./cli/diff.js";
import { runExecutions } from "./cli/executions.js";
import { runFork } from "./cli/fork.js";
import { runHandoff } from "./cli/handoff.js";
import { runHistory } from "./cli/history.js";
import { runImport } from "./cli/import.js";
import { runInit } from "./cli/init.js";
import { runList } from "./cli/list.js";
import { runSessions } from "./cli/sessions.js";
import { runShow } from "./cli/show.js";
import { packageVersion } from "./cli/version.js";

export interface CliWriter {
  write(chunk: string): unknown;
}

export interface RunCliOptions {
  readonly home?: string;
  readonly stdout?: CliWriter;
  readonly stderr?: CliWriter;
}

const usage = `Usage: harnie <command>

Top-level:
  --version, -V     Print the CLI package version and exit
                    (the store schema version and the harnie.cli.v1 JSON
                    envelope schema are separate constants)

Commands:
  init              Create the Harnie home directory and SQLite store
  import pi <path>  Import a Pi session as observed Work
  import opencode <path|session-id>
                    Import an OpenCode session as observed Work
                    (snapshot JSON file, or a live ses_* id from the
                    local OpenCode database; see import --help)
  import codex <path>
                     Import a Codex rollout as observed Work
                     (--work <id> attaches as a new execution)
  import grok <path> Import a Grok session directory (or chat_history.jsonl)
                     as observed Work
  import --help     Explain valid per-harness import paths
  sessions [--harness pi|opencode|codex|grok]
                     List local sessions available for import
  list              List persisted observed Work
  show <work>       Show observed Work
  executions <work> List executions of observed Work
  history <work>    Show execution history of observed Work
  checkpoint <work> [message]
                     Create a checkpoint snapshot of observed Work
  fork <work> [--checkpoint <id>] [message]
                     Fork observed Work at a checkpoint
  diff <work> <execution-a> <execution-b>
                    Diff two executions of observed Work
  handoff <work> [--checkpoint <id>] --to <target>
                      Write a continuation handoff for opencode, pi, codex, or grok
  backup <path>      Write a consistent snapshot of the SQLite store
  restore <path> [--force]
                     Restore the store from a backup file
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

  if ((command === "--version" || command === "-V") && argv.length === 1) {
    stdout.write(`harnie ${packageVersion()}\n`);
    return 0;
  }

  const io = {
    stdout,
    stderr,
    ...(options?.home !== undefined ? { home: options.home } : {}),
  };

  if (command === "init") {
    return runInit(argv.slice(1), io);
  }

  if (command === "import") {
    return runImport(argv.slice(1), io);
  }

  if (command === "sessions") {
    return runSessions(argv.slice(1), io);
  }

  if (command === "list") {
    return runList(argv.slice(1), io);
  }

  if (command === "show") {
    return runShow(argv.slice(1), io);
  }

  if (command === "executions") {
    return runExecutions(argv.slice(1), io);
  }

  if (command === "history") {
    return runHistory(argv.slice(1), io);
  }

  if (command === "checkpoint") {
    return runCheckpoint(argv.slice(1), io);
  }

  if (command === "fork") {
    return runFork(argv.slice(1), io);
  }

  if (command === "diff") {
    return runDiff(argv.slice(1), io);
  }

  if (command === "handoff") {
    return runHandoff(argv.slice(1), io);
  }

  if (command === "backup") {
    return runBackup(argv.slice(1), io);
  }

  if (command === "restore") {
    return runRestore(argv.slice(1), io);
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
