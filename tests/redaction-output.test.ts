import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHandoff } from "../src/cli/handoff.js";
import { runShow } from "../src/cli/show.js";
import { renderCodexHandoff } from "../src/handoff/codex.js";
import { renderOpenCodeHandoff } from "../src/handoff/opencode.js";
import { renderPiHandoff } from "../src/handoff/pi.js";
import { initHarnieStore } from "../src/store/database.js";
import { loadWork, persistObservedWork } from "../src/store/persist.js";
import {
  applyOutputRedaction,
  buildHandoffFromWork,
  RECEIVER_INSTRUCTION_SECTION,
  REDACTION_MARKER_PREFIX,
  redactOutputText,
} from "../src/work/handoff.js";
import type { Provenance, Work, WorkEvent } from "../src/work/types.js";

// FAKE credentials only. These simulate a legacy store imported before any
// ingestion redaction existed: they are written to SQLite directly via
// persistObservedWork, bypassing the readers/observe/engine import path.
// Every value below matches the shared obvious-secret policy in
// src/work/redact.ts (uppercase KEY=/prefixed TOKEN= assignments, provider
// token prefixes, bearer tokens, PEM blocks), so the output backstop must
// catch each of them.
const FAKE_ASSIGNMENT_VALUE = "HARNIE_FAKE_OUTPUT_KEY9";
const FAKE_DEPLOY_TOKEN = "HARNIEFAKE9X7Q2W";
const FAKE_FLAG_VALUE = "HARNIEFAKE9FLAG4D5E";
const FAKE_GITHUB_TOKEN = "ghp_HARNIEFAKEOUTPUTabc123XYZ789";
const FAKE_ANTHROPIC_KEY = "sk-ant-HARNIEFAKEOUTPUTabc123XYZ789ABC";
const FAKE_BEARER_VALUE = "HARNIEFAKEOUTPUTBEARERZZ99Q";
const FAKE_PEM_BLOCK =
  "-----BEGIN PRIVATE KEY-----\nHARNIEFAKEPEMCONTENT00\n-----END PRIVATE KEY-----";

const RAW_SECRETS = [
  FAKE_ASSIGNMENT_VALUE,
  FAKE_DEPLOY_TOKEN,
  FAKE_FLAG_VALUE,
  FAKE_GITHUB_TOKEN,
  FAKE_ANTHROPIC_KEY,
  FAKE_BEARER_VALUE,
  "HARNIEFAKEPEMCONTENT00",
];

const WORK_ID = "work:synthetic:legacy-secrets";
const EXECUTION_ID = "execution:synthetic:legacy-secrets";

const observedProvenance = (): Provenance => ({
  harness: "synthetic",
  line: 1,
  observation: "observed",
});

const derivedProvenance = (): Provenance => ({
  harness: "synthetic",
  line: 1,
  observation: "derived",
});

const messageEvent = (id: string, text: string): WorkEvent => ({
  id,
  workId: WORK_ID,
  executionId: EXECUTION_ID,
  kind: "message",
  payload: { role: "user", text },
  provenance: observedProvenance(),
  diagnostics: [],
});

const buildLegacyWork = (): Work => ({
  id: WORK_ID,
  workspace: { path: "/workspace/legacy-project" },
  executions: [
    {
      id: EXECUTION_ID,
      workId: WORK_ID,
      harness: "synthetic",
      sourceSession: { harness: "synthetic", sourceId: "sess-legacy-1" },
    },
  ],
  events: [
    messageEvent("event:legacy:1", `Deploy the release with API_KEY=${FAKE_ASSIGNMENT_VALUE}`),
    messageEvent("event:legacy:2", `The standby access key AKIAHARNIEFAKEOUTP12 is expired`),
  ],
  diagnostics: [],
  goal: {
    statement: `Ship the release with API_KEY=${FAKE_ASSIGNMENT_VALUE}`,
    evidence: ["event:legacy:1"],
    provenance: derivedProvenance(),
    rule: "test-legacy",
  },
  decisions: [
    {
      id: "decision:legacy:1",
      summary: `I will authenticate with ${FAKE_GITHUB_TOKEN} for the release`,
      evidence: ["event:legacy:1"],
      provenance: derivedProvenance(),
      rule: "test-legacy",
    },
  ],
  findings: [
    {
      id: "finding:legacy:1",
      statement: `Model key ${FAKE_ANTHROPIC_KEY} was present in the environment`,
      evidence: ["event:legacy:2"],
      provenance: derivedProvenance(),
      rule: "test-legacy",
    },
    {
      id: "finding:legacy:2",
      statement: `Private key material observed: ${FAKE_PEM_BLOCK}`,
      evidence: ["event:legacy:2"],
      provenance: derivedProvenance(),
      rule: "test-legacy",
    },
  ],
  nextSteps: [
    {
      id: "next:legacy:1",
      description: `Rotate DEPLOY_TOKEN=${FAKE_DEPLOY_TOKEN} after the deploy`,
      evidence: ["event:legacy:2"],
      provenance: derivedProvenance(),
      rule: "test-legacy",
    },
  ],
  operations: [
    {
      id: "op:legacy:1",
      toolName: "bash",
      command: `deploy with DEPLOY_TOKEN=${FAKE_FLAG_VALUE}`,
      status: "succeeded",
      evidence: ["event:legacy:1"],
      provenance: derivedProvenance(),
      rule: "test-legacy",
    },
    {
      id: "op:legacy:2",
      toolName: "bash",
      command: `curl -H "Authorization: Bearer ${FAKE_BEARER_VALUE}" https://example.invalid/deploy`,
      status: "succeeded",
      evidence: ["event:legacy:2"],
      provenance: derivedProvenance(),
      rule: "test-legacy",
    },
  ],
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

describe("output redaction for legacy unredacted stores", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-redaction-output-"));
    homes.push(home);
    return home;
  };

  const seedLegacyStore = async (home: string): Promise<string> => {
    const store = initHarnieStore({ home });
    try {
      persistObservedWork(store, buildLegacyWork());
      return WORK_ID;
    } finally {
      store.close();
    }
  };

  afterEach(async () => {
    await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true })));
  });

  it("redacts legacy secrets from the structured handoff builder", async () => {
    const home = await makeHome();
    await seedLegacyStore(home);
    const store = initHarnieStore({ home });
    try {
      const loaded = loadWork(store, WORK_ID);
      expect(loaded).toBeDefined();
      const serialized = JSON.stringify(buildHandoffFromWork(loaded as Work));
      for (const raw of RAW_SECRETS) {
        expect(serialized).not.toContain(raw);
      }
      expect(serialized).toContain(REDACTION_MARKER_PREFIX);
    } finally {
      store.close();
    }
  });

  it("redacts legacy secrets in all three handoff renderers with an identical receiver instruction", async () => {
    const home = await makeHome();
    await seedLegacyStore(home);
    const store = initHarnieStore({ home });
    try {
      const loaded = loadWork(store, WORK_ID);
      expect(loaded).toBeDefined();
      const handoff = buildHandoffFromWork(loaded as Work);
      const markdowns = [renderPiHandoff(handoff), renderOpenCodeHandoff(handoff), renderCodexHandoff(handoff)];

      expect(markdowns).toHaveLength(3);
      for (const markdown of markdowns) {
        for (const raw of RAW_SECRETS) {
          expect(markdown).not.toContain(raw);
        }
        expect(markdown).toContain(REDACTION_MARKER_PREFIX);
        expect(markdown).toContain(RECEIVER_INSTRUCTION_SECTION);
        expect(markdown).toContain("## Redaction note");
      }

      // The standing receiver instruction is byte-identical across renderers.
      const occurrences = markdowns.map(
        (markdown) => markdown.split(RECEIVER_INSTRUCTION_SECTION).length - 1,
      );
      expect(occurrences).toEqual([1, 1, 1]);
    } finally {
      store.close();
    }
  });

  it("states evidence-not-authorization and provider-transmission in the receiver instruction", () => {
    expect(RECEIVER_INSTRUCTION_SECTION).toMatch(/historical.*evidence.*not current authorization/i);
    expect(RECEIVER_INSTRUCTION_SECTION).toMatch(/do not replay.*explicit user approval/i);
    expect(RECEIVER_INSTRUCTION_SECTION).toMatch(/another agent may transmit.*through that agent's provider/i);
  });

  it("redacts show output from a legacy store", async () => {
    const home = await makeHome();
    const workId = await seedLegacyStore(home);
    const stdout = capture();
    const stderr = capture();

    const code = await runShow([workId], { home, stdout, stderr });
    const output = stdout.toString();

    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");
    for (const raw of RAW_SECRETS) {
      expect(output).not.toContain(raw);
    }
    expect(output).toContain(REDACTION_MARKER_PREFIX);
  });

  it("redacts handoff CLI stdout and the written handoff file for every target", async () => {
    const home = await makeHome();
    const workId = await seedLegacyStore(home);

    for (const target of ["opencode", "pi", "codex"] as const) {
      const stdout = capture();
      const stderr = capture();
      const code = await runHandoff([workId, "--to", target], { home, stdout, stderr });
      const output = stdout.toString();

      expect(code).toBe(0);
      expect(stderr.toString()).toBe("");
      for (const raw of RAW_SECRETS) {
        expect(output).not.toContain(raw);
      }
      expect(output).toContain(REDACTION_MARKER_PREFIX);
      expect(output).toContain(RECEIVER_INSTRUCTION_SECTION);
    }

    const files = await readdir(join(home, "handoffs"));
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const file of files) {
      const contents = await readFile(join(home, "handoffs", file), "utf8");
      for (const raw of RAW_SECRETS) {
        expect(contents).not.toContain(raw);
      }
    }
  });

  it("keeps output redaction idempotent and never redacts its own marker", () => {
    const once = redactOutputText(`Deploy with API_KEY=${FAKE_ASSIGNMENT_VALUE} and done`);
    expect(once.redactions).toBeGreaterThan(0);
    expect(once.text).toContain(REDACTION_MARKER_PREFIX);
    expect(once.text).not.toContain(FAKE_ASSIGNMENT_VALUE);

    const twice = redactOutputText(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.redactions).toBe(0);

    expect(redactOutputText("[REDACTED:env-secret]").redactions).toBe(0);
    expect(redactOutputText("nothing secret here").redactions).toBe(0);
  });

  it("keeps the applied redaction pass idempotent, including the provenance note", async () => {
    const home = await makeHome();
    await seedLegacyStore(home);
    const store = initHarnieStore({ home });
    try {
      const loaded = loadWork(store, WORK_ID);
      expect(loaded).toBeDefined();
      const handoff = buildHandoffFromWork(loaded as Work);
      const once = renderOpenCodeHandoff(handoff);
      expect(once).toContain("## Redaction note");
      expect(applyOutputRedaction(once)).toBe(once);
    } finally {
      store.close();
    }
  });
});
