import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runShow } from "../src/cli/show.js";
import {
  importCodexSessionFile,
  importOpenCodeSessionFile,
  importPiSessionFile,
} from "../src/engine/import.js";
import { initHarnieStore } from "../src/store/database.js";
import { loadWork } from "../src/store/persist.js";
import {
  containsRedactionMarker,
  redactText,
  SECRET_REDACTED_CODE,
} from "../src/work/redact.js";
import type { Work } from "../src/work/types.js";

// Synthetic credentials only. Every value below is clearly fake (HARNIE_FAKE)
// and exists solely to prove ingestion redaction. Never real secrets.
const AUDIT_VALUE = "HARNIE_FAKE_SECRET_AUDIT_ONLY";
const GITHUB_ENV_VALUE = "HARNIE_FAKE_GITHUB_TOKEN_ABC123";
const OPENAI_FAKE = "sk-HARNIE_FAKE_OPENAI_1234567890abcdef";
const GITHUB_FAKE = "ghp_HARNIEFAKE00000000000000000000";
const AWS_FAKE = "AKIAHARNIEFAKE000012";
const SLACK_FAKE = "xoxb-HARNIE-FAKE-1234567890";
const BEARER_FAKE = "HARNIE_FAKE_BEARER_TOKEN_1234567890";
const PEM_BODY = "HARNIEFAKEHARNIEFAKEHARNIEFAKEHARNIEFAKE";
const PEM_BEGIN = "-----BEGIN PRIVATE KEY-----";

const ALL_FAKE_VALUES = [
  AUDIT_VALUE,
  GITHUB_ENV_VALUE,
  OPENAI_FAKE,
  GITHUB_FAKE,
  AWS_FAKE,
  SLACK_FAKE,
  BEARER_FAKE,
  PEM_BODY,
  PEM_BEGIN,
];

const BENIGN_DECISION = "I will rotate the staging keys next.";

const homes: string[] = [];

const makeHome = async (): Promise<string> => {
  const home = await mkdtemp(join(tmpdir(), "harnie-redaction-"));
  homes.push(home);
  return home;
};

afterEach(async () => {
  await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
});

const capture = () => {
  let output = "";
  return {
    write(chunk: string) {
      output += chunk;
    },
    toString() {
      return output;
    },
  };
};

const persistedText = (work: Work): string => JSON.stringify(work);

const expectNoRawSecrets = (work: Work): void => {
  const text = persistedText(work);
  for (const raw of ALL_FAKE_VALUES) {
    expect(text, `persisted Work leaks fake secret ${raw.slice(0, 16)}...`).not.toContain(raw);
  }
  // Diagnostic details must carry kinds/counts/provenance, never values.
  for (const item of [...work.diagnostics, ...work.events.flatMap((event) => event.diagnostics)]) {
    if (item.code !== SECRET_REDACTED_CODE) continue;
    const details = JSON.stringify(item.details ?? {});
    for (const raw of ALL_FAKE_VALUES) {
      expect(details, `redaction diagnostic leaks fake secret ${raw.slice(0, 16)}...`).not.toContain(raw);
    }
  }
};

const expectTraceability = (work: Work): void => {
  // Work-level summary marker.
  expect(work.diagnostics.map((item) => item.code)).toContain(SECRET_REDACTED_CODE);
  // Per-event markers with kind + field + source provenance.
  const redactedEvents = work.events.filter((event) =>
    event.diagnostics.some((item) => item.code === SECRET_REDACTED_CODE));
  expect(redactedEvents.length).toBeGreaterThan(0);
  for (const event of redactedEvents) {
    const marker = event.diagnostics.find((item) => item.code === SECRET_REDACTED_CODE);
    expect(marker?.severity).toBe("info");
    expect(marker?.location.line).toBeGreaterThan(0);
    const details = marker?.details as { kinds?: unknown; count?: unknown; fields?: unknown } | undefined;
    expect(Array.isArray(details?.kinds) && (details?.kinds as unknown[]).length).toBeGreaterThan(0);
    expect(details?.count).toBeGreaterThan(0);
    expect(Array.isArray(details?.fields) && (details?.fields as unknown[]).length).toBeGreaterThan(0);
  }
  // The audit repro key name is preserved for context while its value is gone.
  expect(persistedText(work)).toContain("API_KEY=[REDACTED:env-secret]");
};

const expectDerivedClaimsClean = (work: Work): void => {
  expect(work.goal?.statement).toBeDefined();
  expect(work.goal?.statement).toContain("[REDACTED:");
  expect(work.goal?.statement).not.toContain(AUDIT_VALUE);
  // Benign goal prose survives verbatim.
  expect(work.goal?.statement).toContain("src/cli.ts");
  const claims = [
    ...(work.decisions ?? []).map((item) => item.summary),
    ...(work.findings ?? []).map((item) => item.statement),
    ...(work.nextSteps ?? []).map((item) => item.description),
  ];
  for (const raw of ALL_FAKE_VALUES) {
    for (const text of claims) {
      expect(text, `derived claim leaks fake secret ${raw.slice(0, 16)}...`).not.toContain(raw);
    }
  }
};

const expectShowSeesRedaction = async (home: string, workId: string): Promise<void> => {
  const stdout = capture();
  const stderr = capture();
  const code = await runShow([workId], { home, stdout, stderr });
  expect(code).toBe(0);
  expect(stderr.toString()).toBe("");
  // A `harnie show` reader sees that something was redacted and why.
  expect(stdout.toString()).toContain(SECRET_REDACTED_CODE);
  expect(stdout.toString()).toContain("[REDACTED:");
  expect(stdout.toString()).not.toContain(AUDIT_VALUE);
};

describe("ingestion redaction", () => {
  it("redacts pi sessions before persistence (audit Finding 7 repro)", async () => {
    const home = await makeHome();
    const store = initHarnieStore({ home });
    try {
      const result = await importPiSessionFile(store, "tests/fixtures/redaction/pi-secrets.jsonl");
      const work = loadWork(store, result.workId);
      expect(result.workId).toBe("work:pi:redact-pi-1");
      expect(work?.events.length).toBeGreaterThan(0);

      expectNoRawSecrets(work!);
      expectTraceability(work!);
      expectDerivedClaimsClean(work!);

      // False positives: benign content is not mangled.
      const text = persistedText(work!);
      expect(text).toContain("cat src/cli.ts");
      expect(text).toContain("ls -la /workspace/redact-pi");
      expect(work?.decisions?.some((item) => item.summary === "I'll start by reading the file.")).toBe(true);
      expect(work?.decisions?.some((item) => item.summary.includes(BENIGN_DECISION))).toBe(true);
      expect(work?.operations?.some((item) => item.path === "src/cli.ts")).toBe(true);
      expect(work?.operations?.some((item) => item.command === "ls -la /workspace/redact-pi")).toBe(true);
      // The bearer sentence becomes a finding with a marker, not a leak.
      expect(work?.findings?.some((item) => item.statement.includes("[REDACTED:bearer-token]"))).toBe(true);

      await expectShowSeesRedaction(home, result.workId);
    } finally {
      store.close();
    }
  });

  it("redacts codex rollouts before persistence", async () => {
    const home = await makeHome();
    const store = initHarnieStore({ home });
    try {
      const result = await importCodexSessionFile(store, "tests/fixtures/redaction/codex-secrets.jsonl");
      const work = loadWork(store, result.workId);
      expect(result.workId).toBe("work:codex:01redactcodex00000000000001");
      expect(work?.events.length).toBeGreaterThan(0);

      expectNoRawSecrets(work!);
      expectTraceability(work!);
      expectDerivedClaimsClean(work!);

      const text = persistedText(work!);
      expect(text).toContain("cat src/cli.ts");
      expect(text).toContain("ls -la /workspace/redact-codex");
      expect(work?.decisions?.some((item) => item.summary.includes(BENIGN_DECISION))).toBe(true);
      expect(work?.operations?.some((item) => item.command === "cat src/cli.ts")).toBe(true);
      expect(work?.operations?.some((item) => item.command === "ls -la /workspace/redact-codex")).toBe(true);
      expect(work?.findings?.some((item) => item.statement.includes("[REDACTED:bearer-token]"))).toBe(true);

      await expectShowSeesRedaction(home, result.workId);
    } finally {
      store.close();
    }
  });

  it("redacts opencode snapshots before persistence", async () => {
    const home = await makeHome();
    const store = initHarnieStore({ home });
    try {
      const result = await importOpenCodeSessionFile(store, "tests/fixtures/redaction/opencode-secrets.json");
      const work = loadWork(store, result.workId);
      expect(result.workId).toBe("work:opencode:ses_redact1");
      expect(work?.events.length).toBeGreaterThan(0);

      expectNoRawSecrets(work!);
      expectTraceability(work!);
      expectDerivedClaimsClean(work!);

      const text = persistedText(work!);
      expect(text).toContain("cat src/cli.ts");
      expect(work?.decisions?.some((item) => item.summary.includes(BENIGN_DECISION))).toBe(true);
      expect(work?.operations?.some((item) => item.path === "src/cli.ts")).toBe(true);
      expect(work?.operations?.some((item) => item.command === "cat src/cli.ts")).toBe(true);
      expect(work?.findings?.some((item) => item.statement.includes("[REDACTED:bearer-token]"))).toBe(true);

      await expectShowSeesRedaction(home, result.workId);
    } finally {
      store.close();
    }
  });
});

describe("redaction pattern set", () => {
  it.each([
    ["env-secret", "deploy with API_KEY=HARNIE_FAKE_SECRET_AUDIT_ONLY tonight", "API_KEY=[REDACTED:env-secret]"],
    ["env-secret", "GITHUB_TOKEN=HARNIE_FAKE_GITHUB_TOKEN_ABC123", "GITHUB_TOKEN=[REDACTED:env-secret]"],
    ["openai-key", "openai key sk-HARNIE_FAKE_OPENAI_1234567890abcdef here", "[REDACTED:openai-key]"],
    ["github-token", "token ghp_HARNIEFAKE00000000000000000000 here", "[REDACTED:github-token]"],
    ["aws-access-key", "aws key AKIAHARNIEFAKE000012 here", "[REDACTED:aws-access-key]"],
    ["slack-token", "slack xoxb-HARNIE-FAKE-1234567890 here", "[REDACTED:slack-token]"],
    ["bearer-token", "Authorization: Bearer HARNIE_FAKE_BEARER_TOKEN_1234567890", "Bearer [REDACTED:bearer-token]"],
    ["pem-private-key", "key:\n-----BEGIN PRIVATE KEY-----\nHARNIEFAKEHARNIEFAKE\n-----END PRIVATE KEY-----", "[REDACTED:pem-private-key]"],
  ])("redacts %s without recording the value", (kind, input, marker) => {
    const result = redactText(input, "payload.content");
    expect(result.text).toContain(marker);
    expect(result.text).not.toContain("HARNIE_FAKE");
    expect(result.text).not.toContain("HARNIEFAKE");
    expect(result.redactions).toHaveLength(1);
    expect(result.redactions[0]?.kind).toBe(kind);
    expect(result.redactions[0]?.field).toBe("payload.content");
    // The redaction record carries kind + field only, never the secret.
    expect(JSON.stringify(result.redactions)).not.toContain("HARNIE");
  });

  it.each([
    "Investigate src/cli.ts. Read it, then propose a plan.",
    "cat src/cli.ts",
    "ls -la /workspace/redact-pi",
    "read a.ts",
    "npm test",
    "Continue the work.",
    "I will update the quiet flag next.",
    "/workspace/harnie-project/src/cli/handoff.ts",
    "API_KEY=$OTHER_VAR",
  ])("leaves benign content untouched: %s", (input) => {
    const result = redactText(input, "payload.content");
    expect(result.text).toBe(input);
    expect(result.redactions).toEqual([]);
    expect(containsRedactionMarker(result.text)).toBe(false);
  });

  it("is deterministic", () => {
    const input = "API_KEY=HARNIE_FAKE_SECRET_AUDIT_ONLY plus sk-HARNIE_FAKE_OPENAI_1234567890abcdef";
    expect(redactText(input, "field")).toEqual(redactText(input, "field"));
  });
});
