import type { CliErrorCode } from "./errors.js";

/**
 * Thrown when command-line flags violate the contract: unknown or duplicate
 * flags, or value flags without a usable value. Commands translate this into
 * their existing text behavior (message/usage + exit 1) and, in JSON mode,
 * into a stable error code.
 */
export class FlagParseError extends Error {
  readonly code: CliErrorCode;

  constructor(message: string, code: CliErrorCode) {
    super(message);
    this.name = "FlagParseError";
    this.code = code;
  }
}

export interface ParsedFlags {
  readonly positionals: readonly string[];
  /** Value flags keyed by flag name; only flags with kind "value" appear. */
  readonly values: Readonly<Record<string, string>>;
  /** Switch flags keyed by flag name; only flags with kind "switch" appear. */
  readonly switches: Readonly<Record<string, boolean>>;
}

export interface FlagSpec {
  readonly [name: string]: { readonly kind: "value" | "switch" };
}

/**
 * Strict flag parser shared by CLI commands. Rejects unknown flags
 * (unknown_flag), the same flag given twice (duplicate_flag), and value
 * flags with a missing or flag-like value (missing_argument). Both
 * `--flag value` and `--flag=value` spellings are accepted.
 */
export const parseFlags = (argv: readonly string[], spec: FlagSpec): ParsedFlags => {
  const positionals: string[] = [];
  const values: Record<string, string> = {};
  const switches: Record<string, boolean> = {};
  const seen = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined || !arg.startsWith("-")) {
      positionals.push(arg ?? "");
      continue;
    }
    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg : arg.slice(0, equals);
    const entry = spec[name];
    if (entry === undefined) {
      throw new FlagParseError(`Unknown flag: ${name}`, "unknown_flag");
    }
    if (seen.has(name)) {
      throw new FlagParseError(`Duplicate flag: ${name}`, "duplicate_flag");
    }
    seen.add(name);
    if (entry.kind === "switch") {
      if (equals !== -1) {
        throw new FlagParseError(`Flag takes no value: ${name}`, "invalid_input");
      }
      switches[name] = true;
      continue;
    }
    let value: string;
    if (equals !== -1) {
      value = arg.slice(equals + 1);
    } else {
      const next = argv[index + 1];
      if (next === undefined || next === "" || next.startsWith("-")) {
        throw new FlagParseError(`Flag requires a value: ${name}`, "missing_argument");
      }
      value = next;
      index += 1;
    }
    values[name] = value;
  }

  return { positionals, values, switches };
};
