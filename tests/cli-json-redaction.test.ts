import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runHandoff } from "../src/cli/handoff.js";
import { runShow } from "../src/cli/show.js";
import { initHarnieStore } from "../src/store/database.js";
import { persistObservedWork } from "../src/store/persist.js";
import { REDACTION_MARKER_PREFIX } from "../src/work/handoff.js";
import type { Provenance, Work, WorkEvent } from "../src/work/types.js";

// FAKE credentials only, mirroring the legacy-store seeding pattern in
// tests/redaction-output.test.ts: the work is written straight to SQLite via
// persistObservedWork, bypassing the ingestion redaction path, simulating a
// store imported before redaction existed.
const FAKE_API_KEY = "HARNIEFAKEJSONKEY7Q4";
const FAKE_GITHUB_TOKEN = "ghp_HARNIEFAKEJSONabc123XYZ789";

const RAW_SECRETS = [FAKE_API_KEY, FAKE_GITHUB_TOKEN];

const WORK_ID = "work:synthetic:legacy-json-secrets";
const EXECUTION_ID = "execution:synthetic:legacy-json-secrets";

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

const buildLegacyWork = (): Work => ({
  id: WORK_ID,
  workspace: { path: "/workspace/legacy-json" },
  executions: [
    {
      id: EXECUTION_ID,
      workId: WORK_ID,
      harness: "synthetic",
      sourceSession: { harness: "synthetic", sourceId: "sess-legacy-json" },
    },
  ],
  events: [
    {
      id: "event:legacy:json:1",
      workId: WORK_ID,
      executionId: EXECUTION_ID,
      kind: "message",
      payload: { role: "user", text: `Run the deploy with API_KEY=${FAKE_API_KEY}` },
      provenance: observedProvenance(),
      diagnostics: [],
    } satisfies WorkEvent,
  ],
  diagnostics: [],
  goal: {
    statement: `Deploy using API_KEY=${FAKE_API_KEY}`,
    evidence: ["event:legacy:json:1"],
    provenance: derivedProvenance(),
    rule: "test-legacy",
  },
  operations: [
    {
      id: "op:legacy:json:1",
      toolName: "bash",
      command: `deploy --token API_KEY=${FAKE_API_KEY}`,
      status: "succeeded",
      note: `authenticated with ${FAKE_GITHUB_TOKEN}`,
      evidence: ["event:legacy:json:1"],
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

interface Envelope {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
}

describe("show/handoff --json redaction for legacy unredacted stores", () => {
  const homes: string[] = [];

  const makeHome = async (): Promise<string> => {
    const home = await mkdtemp(join(tmpdir(), "harnie-json-redaction-"));
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

  it("show --json redacts raw persisted Work fields and counts the output pass", async () => {
    const home = await makeHome();
    const workId = await seedLegacyStore(home);
    const stdout = capture();
    const stderr = capture();

    const code = await runShow([workId, "--json"], { home, stdout, stderr });
    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");

    const envelope = JSON.parse(stdout.toString()) as Envelope;
    expect(envelope.ok).toBe(true);
    const payload = JSON.stringify(envelope);

    // No raw secret anywhere in the JSON payload, including
    // data.work.operations (regression: raw command leak) and
    // data.work.goal.statement.
    for (const raw of RAW_SECRETS) {
      expect(payload).not.toContain(raw);
    }

    const work = envelope.data?.work as {
      operations?: { command?: string; note?: string }[];
      goal?: { statement?: string };
    };
    expect(work.operations?.[0]?.command).toContain("[REDACTED:env-secret]");
    expect(work.operations?.[0]?.command).not.toContain(FAKE_API_KEY);
    expect(work.operations?.[0]?.note).toContain("[REDACTED:github-token]");
    expect(work.goal?.statement).toContain("[REDACTED:env-secret]");

    expect(payload).toContain(REDACTION_MARKER_PREFIX);
    // The redactions field counts output-pass redactions, so it reports a
    // non-zero number for this legacy store (regression: reported 0).
    const redactions = envelope.data?.redactions as number;
    expect(typeof redactions).toBe("number");
    expect(redactions).toBeGreaterThan(0);
  });

  it("show --json redaction pass leaves evidence ids and counts untouched", async () => {
    const home = await makeHome();
    const workId = await seedLegacyStore(home);
    const stdout = capture();
    const stderr = capture();

    const code = await runShow([workId, "--json"], { home, stdout, stderr });
    expect(code).toBe(0);

    const envelope = JSON.parse(stdout.toString()) as Envelope;
    const payload = JSON.stringify(envelope);
    expect(payload).toContain("event:legacy:json:1");
    const work = envelope.data?.work as {
      operations?: { evidence?: string[] }[];
      goal?: { evidence?: string[] };
    };
    expect(work.goal?.evidence).toEqual(["event:legacy:json:1"]);
    expect(work.operations?.[0]?.evidence).toEqual(["event:legacy:json:1"]);
  });

  it("handoff --json emits no raw work fields for a legacy store", async () => {
    const home = await makeHome();
    const workId = await seedLegacyStore(home);
    const stdout = capture();
    const stderr = capture();

    const code = await runHandoff([workId, "--to", "opencode", "--json"], {
      home,
      stdout,
      stderr,
    });
    expect(code).toBe(0);
    expect(stderr.toString()).toBe("");

    const envelope = JSON.parse(stdout.toString()) as Envelope;
    expect(envelope.ok).toBe(true);
    const payload = JSON.stringify(envelope);
    for (const raw of RAW_SECRETS) {
      expect(payload).not.toContain(raw);
    }
    expect(payload).toContain(REDACTION_MARKER_PREFIX);
  });
});
