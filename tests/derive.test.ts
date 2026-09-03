import { describe, expect, it } from "vitest";
import { observePiSession } from "../src/pi/observe.js";
import { readPiJsonlFile, readPiJsonlText } from "../src/pi/reader.js";
import { deriveObservedWork } from "../src/work/derive.js";
import type { Work } from "../src/work/types.js";

describe("deriveObservedWork", () => {
  it("derives a goal and I-will decision from fixture C without rewriting events", async () => {
    const observed = observePiSession(await readPiJsonlFile("tests/fixtures/pi/stateful-prefix.jsonl"));
    const derived = deriveObservedWork(observed);

    expect(derived.goal?.statement).toMatch(/5\.3|xhigh/);
    expect(derived.decisions?.some((decision) => /I will/i.test(decision.summary))).toBe(true);
    expectDerivedClaimsHaveEvidence(derived);
    expect(observed.events.every((event) => event.provenance.observation === "observed")).toBe(true);
    expect(derived.events.every((event) => event.provenance.observation === "observed")).toBe(true);
    expect(derived.events).toBe(observed.events);
  });

  it("derives unfinished next work from trace B without inventing completion", async () => {
    const observed = observePiSession(await readPiJsonlFile("tests/fixtures/pi/trace-b-unfinished.jsonl"));
    const derived = deriveObservedWork(observed);

    expect(derived.goal?.statement).toMatch(/investigate/i);
    expect(derived.nextSteps?.length).toBeGreaterThan(0);
    expect(derived.nextSteps?.[0]?.description).toMatch(/Complete pending tool call/);
    expect(derived.findings ?? []).toEqual([]);
    for (const finding of derived.findings ?? []) {
      expect(finding.statement).not.toMatch(/complete|finished|done|refactoring plan/i);
    }
    expectDerivedClaimsHaveEvidence(derived);
  });

  it("does not invent decisions from header-only or messages without I will", () => {
    const headerOnly = deriveObservedWork(observePiSession(readPiJsonlText(
      '{"type":"session","version":3,"id":"s1","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
    )));
    const messagesOnly = deriveObservedWork(observePiSession(readPiJsonlText([
      '{"type":"session","version":3,"id":"s2","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
      '{"type":"message","id":"u1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"user","content":[{"type":"text","text":"hello"}]}}',
      '{"type":"message","id":"a1","parentId":"u1","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"assistant","content":[{"type":"text","text":"Sure, I can help with that."}]}}',
    ].join("\n"))));

    expect(headerOnly).not.toHaveProperty("decisions");
    expect(headerOnly).not.toHaveProperty("goal");
    expect(messagesOnly).not.toHaveProperty("decisions");
    expect(messagesOnly.goal?.statement).toBe("hello");
  });

  it("does not mutate the input work object", async () => {
    const observed = observePiSession(await readPiJsonlFile("tests/fixtures/pi/stateful-prefix.jsonl"));
    const before = structuredClone(observed);
    const events = observed.events;

    const derived = deriveObservedWork(observed);

    expect(observed).toEqual(before);
    expect(derived.events).toBe(events);
    expect(observed).not.toHaveProperty("goal");
    expect(observed).not.toHaveProperty("decisions");
    expect(derived.goal).toBeDefined();
    expect(derived.decisions?.length).toBeGreaterThan(0);
  });
});

const expectDerivedClaimsHaveEvidence = (work: Work): void => {
  const claims = [
    ...(work.goal ? [work.goal] : []),
    ...(work.decisions ?? []),
    ...(work.findings ?? []),
    ...(work.nextSteps ?? []),
  ];

  expect(claims.length).toBeGreaterThan(0);
  for (const claim of claims) {
    expect(claim.evidence.length).toBeGreaterThanOrEqual(1);
    expect(claim.provenance.observation).toBe("derived");
  }
};
