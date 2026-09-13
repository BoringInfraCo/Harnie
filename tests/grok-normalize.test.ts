import { describe, expect, it } from "vitest";
import { normalizeGrokSession } from "../src/grok/normalize.js";
import type { GrokChatEntry, GrokSession } from "../src/grok/types.js";
import type { JsonObject } from "../src/types.js";

const sessionId = "01groknormalize00000000000001";

const userEntry = (line: number, content: unknown): GrokChatEntry => ({
  type: "user",
  line,
  record: { type: "user", content } as JsonObject,
});

const session = (...entries: GrokChatEntry[]): GrokSession => ({
  harness: "grok",
  format: "grok-chat-v1",
  sessionId,
  entries,
  diagnostics: [],
});

const textBlock = (text: string): unknown => [{ type: "text", text }];

describe("normalizeGrokSession user entries", () => {
  it("emits a user message from <user_query> blocks, joined by newline", () => {
    const events = normalizeGrokSession(session(userEntry(1, textBlock(
      "<user_info>\nWorkspace Path: /w\n</user_info>\n" +
      "<user_query>First task.</user_query>\n" +
      "<git_status>## main</git_status>\n" +
      "<user_query>Second task.</user_query>",
    ))));

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("message");
    expect(events[0]?.payload).toEqual({ role: "user", content: "First task.\nSecond task." });
    expect(events[0]?.id).toBe(`${"grok"}:${sessionId}:1:message`);
    expect(events[0]?.provenance.sourceType).toBe("user");
  });

  it("emits a user message from a plain untagged prompt string", () => {
    const events = normalizeGrokSession(session(userEntry(
      2,
      "Implement the widget renderer and run its tests.",
    )));

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("message");
    expect(events[0]?.payload).toEqual({
      role: "user",
      content: "Implement the widget renderer and run its tests.",
    });
  });

  it("treats pure <user_info> + <git_status> entries as user_context", () => {
    const events = normalizeGrokSession(session(userEntry(3, textBlock(
      "<user_info>\nOS Version: macos\nWorkspace Path: /w\n</user_info>\n\n" +
      "<git_status>\n## master\n?? src/widget/\n</git_status>",
    ))));

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("unknown");
    expect(events[0]?.provenance.sourceType).toBe("user_context");
    expect(events[0]?.payload).toEqual({ sourceType: "user_context" });
  });

  it("treats a closed <system-reminder>-only entry as user_context", () => {
    const events = normalizeGrokSession(session(userEntry(4, textBlock(
      "<system-reminder>\nThe task list is currently empty.\n</system-reminder>",
    ))));

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("unknown");
    expect(events[0]?.payload).toEqual({ sourceType: "user_context" });
  });

  it("treats an unclosed <system-reminder>-only entry as user_context", () => {
    const events = normalizeGrokSession(session(userEntry(5, textBlock(
      "<system-reminder>\nNo closing tag follows this reminder.",
    ))));

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("unknown");
    expect(events[0]?.payload).toEqual({ sourceType: "user_context" });
    expect(events[0]?.provenance.sourceType).toBe("user_context");
  });

  it("strips context wrappers and keeps trailing untagged speech", () => {
    const events = normalizeGrokSession(session(userEntry(6, textBlock(
      "<system-reminder>\nBackground note.\n</system-reminder>\n" +
      "<user_info>\nWorkspace Path: /w\n</user_info>\n" +
      "<git_status>\n## main\n</git_status>\n" +
      "Real task follows.",
    ))));

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("message");
    expect(events[0]?.payload).toEqual({ role: "user", content: "Real task follows." });
  });

  it("treats a <rules> entry (with nested user_rules) as user_context, not speech", () => {
    const events = normalizeGrokSession(session(userEntry(7, textBlock(
      "<user_info>\nWorkspace Path: /w\n</user_info>\n" +
      "<rules>\nThe rules section has possible rules/memories/context.\n" +
      "<always_applied_workspace_rules description=\"ws\">\nUse tabs.\n</always_applied_workspace_rules>\n" +
      "<user_rules>\n<user_rule>Prefer small diffs.</user_rule>\n</user_rules>\n" +
      "</rules>",
    ))));

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("unknown");
    expect(events[0]?.provenance.sourceType).toBe("user_context");
    expect(events[0]?.payload).toEqual({ sourceType: "user_context" });
  });

  it("prefers <user_query> over an earlier rules-only context entry", () => {
    const events = normalizeGrokSession(session(
      userEntry(8, textBlock("<rules>\n<user_rules>\n<user_rule>Be terse.</user_rule>\n</user_rules>\n</rules>")),
      userEntry(9, textBlock("<user_query>Do the real thing.</user_query>")),
    ));

    expect(events).toHaveLength(2);
    expect(events[0]?.kind).toBe("unknown");
    expect(events[1]?.kind).toBe("message");
    expect(events[1]?.payload).toEqual({ role: "user", content: "Do the real thing." });
  });

  it("treats a whitespace-only <user_query> as context, never a false goal", () => {
    const events = normalizeGrokSession(session(userEntry(10, textBlock(
      "<user_query>   </user_query><rules>\n<user_rules>\n<user_rule>Be terse.</user_rule>\n</user_rules>\n</rules>",
    ))));

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("unknown");
    expect(events[0]?.provenance.sourceType).toBe("user_context");
    expect(events[0]?.payload).toEqual({ sourceType: "user_context" });
    expect(JSON.stringify(events[0]?.payload)).not.toContain("user_query");
  });

  it("keeps untagged speech after an empty <user_query> wrapper", () => {
    const events = normalizeGrokSession(session(userEntry(11, textBlock(
      "<user_query></user_query>\nDo the thing without a query wrapper.",
    ))));

    expect(events).toHaveLength(1);
    expect(events[0]?.kind).toBe("message");
    expect(events[0]?.payload).toEqual({
      role: "user",
      content: "Do the thing without a query wrapper.",
    });
  });
});
