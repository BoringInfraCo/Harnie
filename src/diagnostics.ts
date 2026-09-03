import type { Diagnostic, DiagnosticLocation, JsonValue } from "./types.js";

export const diagnostic = (
  code: string,
  severity: Diagnostic["severity"],
  message: string,
  location: DiagnosticLocation,
  details?: JsonValue,
): Diagnostic =>
  details === undefined
    ? { code, severity, message, location }
    : { code, severity, message, location, details };
