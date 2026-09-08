import { diagnostic } from "../diagnostics.js";
import { isJsonObject, type Diagnostic, type DiagnosticLocation, type JsonObject, type JsonValue } from "../types.js";
import type { Provenance, Work, WorkEvent } from "./types.js";

// Conservative ingestion redaction for Order 2 (audit Finding 7).
//
// V0 policy: avoid persisting obvious, identifiable secrets. The pattern set
// below only matches shapes with a strong, self-identifying structure:
// well-known `*_KEY=` / `*_SECRET=` / `*_TOKEN=` (etc.) env assignments,
// PEM private-key blocks, common provider prefixes (`sk-`, `ghp_`/`gho_`,
// `AKIA`, `xox[baprs]-`) and `Bearer` tokens. Matching is purely
// deterministic (regex only): no model calls, no new dependencies.
//
// Deliberate non-goals live with the caller documentation; see the known-gaps
// section of the regression test.

export type SecretKind =
  | "env-secret"
  | "pem-private-key"
  | "openai-key"
  | "github-token"
  | "aws-access-key"
  | "slack-token"
  | "bearer-token";

export interface SecretRedaction {
  // WHAT kind of secret shape was found. Never the matched value itself.
  readonly kind: SecretKind;
  // WHERE it was found, as a JSON field path (e.g. "payload.content[0].text").
  // Event/source provenance travels alongside in the emitted diagnostic.
  readonly field: string;
}

export interface RedactTextResult {
  readonly text: string;
  readonly redactions: readonly SecretRedaction[];
}

export interface RedactJsonResult {
  readonly value: JsonValue;
  readonly redactions: readonly SecretRedaction[];
}

export interface RedactionSummary {
  readonly count: number;
  readonly kinds: readonly string[];
  readonly fields: readonly string[];
}

export const SECRET_REDACTED_CODE = "secret_redacted";
export const REDACTION_MARKER_PREFIX = "[REDACTED:";

export const redactionMarker = (kind: SecretKind): string => `[REDACTED:${kind}]`;

export const containsRedactionMarker = (value: string): boolean =>
  value.includes(REDACTION_MARKER_PREFIX);

// --- pattern set -----------------------------------------------------------

const PEM_SOURCE =
  "-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----[\\s\\S]*?" +
  "-----END (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----";

// Uppercase env-style assignment: FOO_KEY=..., FOO_SECRET=..., FOO_TOKEN=...,
// FOO_PASSWORD=..., FOO_PASSWD=..., FOO_CREDENTIAL(S)=.... The key name is
// preserved for context; only the value is replaced.
const ENV_SOURCE =
  "\\b([A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIALS?))" +
  "\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s\"'`,;]+)";

const GITHUB_SOURCE = "\\bgh[pousr]_[A-Za-z0-9]{20,}\\b";
const OPENAI_SOURCE = "\\bsk-[A-Za-z0-9\\-_]{16,}\\b";
const AWS_SOURCE = "\\bAKIA[0-9A-Z]{16}\\b";
const SLACK_SOURCE = "\\bxox[baprs]-[A-Za-z0-9\\-]{8,}\\b";
// A bare word-boundary anchor is unreliable when a token ends in `=`, so use
// a trailing lookahead for the bearer token charset instead.
const BEARER_SOURCE = "\\bBearer\\s+([A-Za-z0-9\\-._~+/=]{10,})(?![A-Za-z0-9\\-._~+/=])";

const TRAILING_PUNCTUATION = new Set([".", ",", ":", "!", "?", ")"]);

const isRedactedValue = (value: string): boolean => value.startsWith(REDACTION_MARKER_PREFIX);

const isEnvReference = (value: string): boolean =>
  value.startsWith("$") && !value.startsWith("${{");

const stripQuotes = (value: string): string => {
  if (value.length >= 2) {
    const first = value.charAt(0);
    const last = value.charAt(value.length - 1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
};

const splitTrailingPunctuation = (value: string): { core: string; trailing: string } => {
  let end = value.length;
  while (end > 0 && TRAILING_PUNCTUATION.has(value.charAt(end - 1) ?? "")) {
    end -= 1;
  }
  return { core: value.slice(0, end), trailing: value.slice(end) };
};

const replaceEnvAssignment = (match: string, name: string, rawValue: string, field: string, redactions: SecretRedaction[]): string => {
  const value = String(rawValue ?? "");
  if (value === "" || isRedactedValue(value) || isEnvReference(value)) return match;
  const quoted = (value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"));
  if (quoted) {
    if (stripQuotes(value).length < 4) return match;
    redactions.push({ kind: "env-secret", field });
    return `${String(name)}=${redactionMarker("env-secret")}`;
  }
  const { core, trailing } = splitTrailingPunctuation(value);
  if (stripQuotes(core).length < 4) return match;
  redactions.push({ kind: "env-secret", field });
  return `${String(name)}=${redactionMarker("env-secret")}${trailing}`;
};

export const redactText = (text: string, field: string): RedactTextResult => {
  if (text === "") return { text, redactions: [] };
  const redactions: SecretRedaction[] = [];
  let current = text;

  current = current.replace(new RegExp(PEM_SOURCE, "g"), () => {
    redactions.push({ kind: "pem-private-key", field });
    return redactionMarker("pem-private-key");
  });

  current = current.replace(new RegExp(ENV_SOURCE, "g"), (match, name, rawValue) =>
    replaceEnvAssignment(match, name as string, rawValue as string, field, redactions));

  const simple: ReadonlyArray<{ readonly kind: SecretKind; readonly source: string }> = [
    { kind: "github-token", source: GITHUB_SOURCE },
    { kind: "openai-key", source: OPENAI_SOURCE },
    { kind: "aws-access-key", source: AWS_SOURCE },
    { kind: "slack-token", source: SLACK_SOURCE },
  ];
  for (const pattern of simple) {
    current = current.replace(new RegExp(pattern.source, "g"), () => {
      redactions.push({ kind: pattern.kind, field });
      return redactionMarker(pattern.kind);
    });
  }

  // The bearer token charset legitimately contains `.`, so a sentence-final
  // period would otherwise be swallowed into the token (mangling prose and
  // breaking downstream sentence splitting). Peel it back off.
  current = current.replace(new RegExp(BEARER_SOURCE, "g"), (match, token) => {
    const raw = String(token ?? "");
    const { core, trailing } = splitTrailingPunctuation(raw);
    if (core.length < 10) return match;
    redactions.push({ kind: "bearer-token", field });
    return `Bearer ${redactionMarker("bearer-token")}${trailing}`;
  });

  return { text: current, redactions };
};

export const redactJsonValue = (value: JsonValue, field: string): RedactJsonResult => {
  if (typeof value === "string") {
    const redacted = redactText(value, field);
    return { value: redacted.text, redactions: redacted.redactions };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const redactions: SecretRedaction[] = [];
    const next = value.map((item, index) => {
      const redacted = redactJsonValue(item, `${field}[${index}]`);
      if (redacted.redactions.length > 0) {
        changed = true;
        redactions.push(...redacted.redactions);
      }
      return redacted.value;
    });
    if (!changed) return { value, redactions: [] };
    return { value: next, redactions };
  }
  if (isJsonObject(value)) {
    let changed = false;
    const redactions: SecretRedaction[] = [];
    const next: JsonObject = {};
    for (const [key, entry] of Object.entries(value)) {
      const redacted = redactJsonValue(entry as JsonValue, `${field}.${key}`);
      if (redacted.redactions.length > 0) {
        changed = true;
        redactions.push(...redacted.redactions);
      }
      next[key] = redacted.value;
    }
    if (!changed) return { value, redactions: [] };
    return { value: next, redactions };
  }
  return { value, redactions: [] };
};

export const summarizeRedactions = (redactions: readonly SecretRedaction[]): RedactionSummary => {
  const kinds = [...new Set(redactions.map((redaction) => redaction.kind))].sort();
  const fields = [...new Set(redactions.map((redaction) => redaction.field))].sort();
  return { count: redactions.length, kinds, fields };
};

export const secretRedactedDiagnostic = (
  summary: RedactionSummary,
  message: string,
  location: DiagnosticLocation,
  details?: JsonValue,
): Diagnostic =>
  diagnostic(SECRET_REDACTED_CODE, "info", message, location, details ?? {
    kinds: [...summary.kinds],
    count: summary.count,
    fields: [...summary.fields],
  });

export const provenanceLocation = (provenance: Provenance): DiagnosticLocation => ({
  ...(provenance.sourceLocation ? { path: provenance.sourceLocation } : {}),
  line: provenance.line,
  ...(provenance.sourceEntry ? { entryId: provenance.sourceEntry } : {}),
  ...(provenance.contentIndex !== undefined ? { contentIndex: provenance.contentIndex } : {}),
  ...(provenance.toolCallId ? { toolCallId: provenance.toolCallId } : {}),
});

// Final ingestion safety net: redact every persisted string (event payloads,
// derived claims, operation free text) and record traceability diagnostics.
// Already-redacted text is a no-op, so this is idempotent and safe to run
// after the observe/derive passes, including on refresh/attach merges.
export const redactWork = (work: Work): Work => {
  let accumulated: SecretRedaction[] = [];

  const events = work.events.map((event) => {
    const redacted = redactJsonValue(event.payload, "payload");
    if (redacted.redactions.length === 0) return event;
    accumulated = [...accumulated, ...redacted.redactions];
    const summary = summarizeRedactions(redacted.redactions);
    const eventDiagnostic = secretRedactedDiagnostic(
      summary,
      `Redacted ${summary.count} secret value(s) (${summary.kinds.join(", ")}) from event ${event.id}.`,
      provenanceLocation(event.provenance),
    );
    return {
      ...event,
      payload: redacted.value as JsonObject,
      diagnostics: [...event.diagnostics, eventDiagnostic],
    };
  });

  let goal = work.goal;
  if (goal) {
    const redacted = redactText(goal.statement, "goal.statement");
    if (redacted.text !== goal.statement) {
      accumulated = [...accumulated, ...redacted.redactions];
      goal = { ...goal, statement: redacted.text };
    }
  }

  let decisions = work.decisions;
  if (decisions) {
    const next = decisions.map((decision, index) => {
      const redacted = redactText(decision.summary, `decisions[${index}].summary`);
      if (redacted.text === decision.summary) return decision;
      accumulated = [...accumulated, ...redacted.redactions];
      return { ...decision, summary: redacted.text };
    });
    if (next.some((decision, index) => decision !== decisions?.[index])) decisions = next;
  }

  let findings = work.findings;
  if (findings) {
    const next = findings.map((finding, index) => {
      const redacted = redactText(finding.statement, `findings[${index}].statement`);
      if (redacted.text === finding.statement) return finding;
      accumulated = [...accumulated, ...redacted.redactions];
      return { ...finding, statement: redacted.text };
    });
    if (next.some((finding, index) => finding !== findings?.[index])) findings = next;
  }

  let nextSteps = work.nextSteps;
  if (nextSteps) {
    const next = nextSteps.map((step, index) => {
      const redacted = redactText(step.description, `nextSteps[${index}].description`);
      if (redacted.text === step.description) return step;
      accumulated = [...accumulated, ...redacted.redactions];
      return { ...step, description: redacted.text };
    });
    if (next.some((step, index) => step !== nextSteps?.[index])) nextSteps = next;
  }

  let operations = work.operations;
  if (operations) {
    const next = operations.map((operation, index) => {
      let changed = false;
      let path = operation.path;
      let command = operation.command;
      let note = operation.note;
      if (path !== undefined) {
        const redacted = redactText(path, `operations[${index}].path`);
        if (redacted.text !== path) {
          changed = true;
          accumulated = [...accumulated, ...redacted.redactions];
          path = redacted.text;
        }
      }
      if (command !== undefined) {
        const redacted = redactText(command, `operations[${index}].command`);
        if (redacted.text !== command) {
          changed = true;
          accumulated = [...accumulated, ...redacted.redactions];
          command = redacted.text;
        }
      }
      if (note !== undefined) {
        const redacted = redactText(note, `operations[${index}].note`);
        if (redacted.text !== note) {
          changed = true;
          accumulated = [...accumulated, ...redacted.redactions];
          note = redacted.text;
        }
      }
      if (!changed) return operation;
      return {
        ...operation,
        ...(path !== undefined ? { path } : {}),
        ...(command !== undefined ? { command } : {}),
        ...(note !== undefined ? { note } : {}),
      };
    });
    if (next.some((operation, index) => operation !== operations?.[index])) operations = next;
  }

  if (accumulated.length === 0) return work;

  const summary = summarizeRedactions(accumulated);
  const workDiagnostic = secretRedactedDiagnostic(
    summary,
    `Redacted ${summary.count} secret value(s) (${summary.kinds.join(", ")}) before persistence. ` +
    "Secret values replaced with markers; see event diagnostics for provenance.",
    {},
  );

  return {
    ...work,
    events,
    diagnostics: [...work.diagnostics, workDiagnostic],
    ...(goal ? { goal } : {}),
    ...(decisions ? { decisions } : {}),
    ...(findings ? { findings } : {}),
    ...(nextSteps ? { nextSteps } : {}),
    ...(operations ? { operations } : {}),
  };
};

export const isWorkEventWithRedaction = (event: WorkEvent): boolean =>
  event.diagnostics.some((item) => item.code === SECRET_REDACTED_CODE);
