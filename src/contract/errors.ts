/**
 * Stable error codes for the machine contract (`--json` mode).
 *
 * Codes are part of the published contract: they may gain new members but
 * existing codes must never change meaning or spelling. Text mode never
 * prints these codes; they appear only inside JSON error envelopes.
 */
export const CLI_ERROR_CODES = {
  usage: "usage",
  unknown_command: "unknown_command",
  unknown_flag: "unknown_flag",
  duplicate_flag: "duplicate_flag",
  missing_argument: "missing_argument",
  not_found: "not_found",
  invalid_input: "invalid_input",
  store_error: "store_error",
  unsupported: "unsupported",
} as const;

export type CliErrorCode = (typeof CLI_ERROR_CODES)[keyof typeof CLI_ERROR_CODES];

/**
 * Classifies an error thrown by a store/work layer call into a stable code,
 * using the established message prefixes ("Work not found: …",
 * "Execution not found: …", "Checkpoint not found: …"). Anything else is a
 * store-level failure.
 */
export const classifyErrorText = (message: string): CliErrorCode => {
  if (
    /^Work not found: /.test(message) ||
    /^Execution not found: /.test(message) ||
    /^Checkpoint not found: /.test(message) ||
    /^Session file not found: /.test(message)
  ) {
    return "not_found";
  }
  return "store_error";
};
