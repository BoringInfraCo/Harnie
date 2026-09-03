import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { readCodexJsonlFile, readCodexJsonlText } from "../src/codex/reader.js";

const FIXTURE = "tests/fixtures/codex/unfinished-read.jsonl";

describe("Codex JSONL reader", () => {
  it("reads the unfinished fixture", async () => {
    const rollout = await readCodexJsonlFile(FIXTURE);

    expect(rollout.harness).toBe("codex");
    expect(rollout.format).toBe("codex-rollout-v1");
    expect(rollout.sessionId).toBe("01codexunfinished000000000001");
    expect(rollout.cwd).toBe("/workspace/codex-project");
    expect(rollout.model).toBe("gpt-5.4");
    expect(rollout.records.some((record) => record.type === "session_meta")).toBe(true);
    expect(rollout.records.some((record) => record.type === "response_item")).toBe(true);
    expect(rollout.records.some((record) => record.type === "event_msg")).toBe(true);
  });

  it("does not contain local machine paths in fixture text", async () => {
    const text = await readFile(FIXTURE, "utf8");
    expect(text).not.toContain("/Users/");
    expect(text).not.toContain("/private/tmp");
    expect(text).not.toContain("sergio");
  });

  it("skips malformed JSONL and still returns the session", () => {
    const text = [
      '{"timestamp":"2026-01-15T12:00:00.000Z","type":"session_meta","payload":{"id":"01codexunfinished000000000001","cwd":"/workspace/codex-project","source":"cli"}}',
      '{"type":',
      '{"timestamp":"2026-01-15T12:00:01.000Z","type":"turn_context","payload":{"model":"gpt-5.4"}}',
    ].join("\n");

    const rollout = readCodexJsonlText(text, "/tmp/codex.jsonl");

    expect(rollout.sessionId).toBe("01codexunfinished000000000001");
    expect(rollout.model).toBe("gpt-5.4");
    expect(rollout.records.map((record) => record.line)).toEqual([1, 3]);
    expect(rollout.diagnostics.map((diag) => diag.code)).toContain("malformed_jsonl");
  });

  it("throws when session_meta id is missing", () => {
    const text = '{"type":"session_meta","payload":{"cwd":"/workspace/codex-project"}}\n';

    expect(() => readCodexJsonlText(text, "/tmp/codex-missing-id.jsonl")).toThrow(
      /missing session_meta\.id/,
    );
  });
});
