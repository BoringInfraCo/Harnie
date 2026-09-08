import type { CliErrorCode } from "./errors.js";

/**
 * Versioned envelope for `--json` CLI output. Bumping the schema value is a
 * breaking change: it must only happen when data shapes change incompatibly,
 * and it must be announced in docs/internal/MACHINE-CONTRACT.md.
 */
export const CLI_JSON_SCHEMA = "harnie.cli.v1";

export interface JsonSuccess {
  readonly schema: typeof CLI_JSON_SCHEMA;
  readonly command: string;
  readonly ok: true;
  readonly data: unknown;
}

export interface JsonFailure {
  readonly schema: typeof CLI_JSON_SCHEMA;
  readonly command: string;
  readonly ok: false;
  readonly error: {
    readonly code: CliErrorCode;
    readonly message: string;
  };
}

export type JsonEnvelope = JsonSuccess | JsonFailure;

export interface JsonWriter {
  write(chunk: string): unknown;
}

/**
 * Success envelope. Key order is part of the contract: schema, command, ok,
 * data (error: schema, command, ok, error.code, error.message). Object key
 * order elsewhere is insertion order of the literal that builds it.
 */
export const jsonSuccess = (command: string, data: unknown): JsonSuccess => ({
  schema: CLI_JSON_SCHEMA,
  command,
  ok: true,
  data,
});

export const jsonFailure = (
  command: string,
  code: CliErrorCode,
  message: string,
): JsonFailure => ({
  schema: CLI_JSON_SCHEMA,
  command,
  ok: false,
  error: { code, message },
});

/**
 * JSON envelopes — success and failure — are written to stdout, one line,
 * newline-terminated. stderr stays reserved for text diagnostics so a
 * machine consumer only ever parses stdout. The exit code still signals
 * failure (non-zero).
 */
export const writeJsonEnvelope = (stdout: JsonWriter, envelope: JsonEnvelope): void => {
  stdout.write(`${JSON.stringify(envelope)}\n`);
};

export const emitJsonSuccess = (
  stdout: JsonWriter,
  command: string,
  data: unknown,
): number => {
  writeJsonEnvelope(stdout, jsonSuccess(command, data));
  return 0;
};

export const emitJsonFailure = (
  stdout: JsonWriter,
  command: string,
  code: CliErrorCode,
  message: string,
): number => {
  writeJsonEnvelope(stdout, jsonFailure(command, code, message));
  return 1;
};
