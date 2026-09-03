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

  it("does not derive a decision from a typed thinking block", () => {
    const derived = deriveObservedWork(observePiSession(readPiJsonlText([
      '{"type":"session","version":3,"id":"think-block","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
      '{"type":"message","id":"u1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"user","content":[{"type":"text","text":"Look around."}]}}',
      '{"type":"message","id":"a1","parentId":"u1","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"assistant","content":[{"type":"thinking","thinking":"I will secretly rewrite the database."},{"type":"text","text":"Looking at the repo."}]}}',
    ].join("\n"))));

    expect(derived).not.toHaveProperty("decisions");
    expect(derived.decisions?.some((decision) => /secretly rewrite/i.test(decision.summary))).not.toBe(true);
    expect(derived.goal?.statement).toBe("Look around.");
    expectDerivedClaimsHaveEvidence(derived);
  });

  it("does not derive decisions or findings from XML thinking tags while keeping visible I-will", () => {
    const derived = deriveObservedWork(observePiSession(readPiJsonlText([
      '{"type":"session","version":3,"id":"xml-thinking","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
      '{"type":"message","id":"u1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"user","content":[{"type":"text","text":"Read src/cli/handoff.ts"}]}}',
      '{"type":"message","id":"a1","parentId":"u1","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"assistant","content":[{"type":"toolCall","id":"c1","name":"read","arguments":{"path":"src/cli/handoff.ts"}}]}}',
      '{"type":"message","id":"r1","parentId":"a1","timestamp":"2026-01-01T00:00:03.000Z","message":{"role":"toolResult","toolCallId":"c1","toolName":"read","content":[{"type":"text","text":"export const runHandoff = () => {}"}],"isError":false}}',
      '{"type":"message","id":"a2","parentId":"r1","timestamp":"2026-01-01T00:00:04.000Z","message":{"role":"assistant","content":[{"type":"text","text":"<thinking>I\'ll need to read the files. It seems like the files were not read successfully. I will attempt to read them again.</thinking>\\nThe gate is centralized. I will update that predicate."}]}}',
    ].join("\n"))));

    expect(derived.decisions?.some((decision) => /I will update that predicate/i.test(decision.summary))).toBe(true);
    const claims = [
      ...(derived.decisions ?? []).map((decision) => decision.summary),
      ...(derived.findings ?? []).map((finding) => finding.statement),
    ];
    for (const text of claims) {
      expect(text).not.toMatch(/not read successfully/i);
      expect(text).not.toMatch(/I'll need to read/i);
      expect(text).not.toMatch(/attempt to read them again/i);
    }
    expectDerivedClaimsHaveEvidence(derived);
  });

  it("does not leak I-will from unclosed thinking tags", () => {
    const derived = deriveObservedWork(observePiSession(readPiJsonlText([
      '{"type":"session","version":3,"id":"unclosed-thinking","timestamp":"2026-01-01T00:00:00.000Z","cwd":"/workspace"}',
      '{"type":"message","id":"u1","parentId":null,"timestamp":"2026-01-01T00:00:01.000Z","message":{"role":"user","content":[{"type":"text","text":"Wrap up."}]}}',
      '{"type":"message","id":"a1","parentId":"u1","timestamp":"2026-01-01T00:00:02.000Z","message":{"role":"assistant","content":[{"type":"text","text":"<thinking>I will invent a completion report"}]}}',
    ].join("\n"))));

    expect(derived).not.toHaveProperty("decisions");
    expectDerivedClaimsHaveEvidence(derived);
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
