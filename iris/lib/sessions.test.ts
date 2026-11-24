import { describe, expect, it } from "vitest";

import type { AgentSessionMessage, SessionMember } from "./api";
import {
  applyEvent,
  authorLabel,
  conversationOf,
  participationLabel,
  SseParser,
  withUserMessage,
  type AguiEvent,
} from "./sessions";

const facilitator = {
  kind: "facilitator" as const,
  agentId: "f",
  agentVersionId: "f-1",
};
const architect = {
  kind: "member" as const,
  agentId: "a",
  agentVersionId: "a-1",
};
const members: SessionMember[] = [
  {
    agentId: "a",
    agentVersionId: "a-1",
    name: "Architect",
    participation: "required",
    role: "design",
    when: null,
    invited: true,
  },
  {
    agentId: "s",
    agentVersionId: "s-1",
    name: "Security",
    participation: "conditional",
    role: null,
    when: "Anything about login",
    invited: false,
  },
];

describe("SseParser", () => {
  it("reads events across chunks and skips what isn't one", () => {
    const parser = new SseParser();
    expect(parser.push('data: {"type":"RUN_STA')).toEqual([]);
    expect(
      parser.push('RTED"}\n\ndata: not json\n\ndata: {"type":"RUN_FINISHED"}\r\n\r\n'),
    ).toEqual([{ type: "RUN_STARTED" }, { type: "RUN_FINISHED" }]);
  });
});

describe("the conversation", () => {
  it("follows a council turn: the facilitator's call, the member's answer, its result", () => {
    const events: AguiEvent[] = [
      { type: "RUN_STARTED" },
      {
        type: "CUSTOM",
        name: "message-author",
        value: { messageId: "f-msg", author: facilitator },
      },
      {
        type: "TOOL_CALL_START",
        toolCallId: "ask-1",
        toolCallName: "ask_member",
        parentMessageId: "f-msg",
      },
      { type: "TOOL_CALL_ARGS", toolCallId: "ask-1", delta: '{"agentId":"a"}' },
      { type: "TOOL_CALL_END", toolCallId: "ask-1" },
      {
        type: "CUSTOM",
        name: "message-author",
        value: { messageId: "m-msg", author: architect },
      },
      { type: "TEXT_MESSAGE_START", messageId: "m-msg" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "m-msg", delta: "Post" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "m-msg", delta: "gres." },
      { type: "TEXT_MESSAGE_END", messageId: "m-msg" },
      {
        type: "TOOL_CALL_RESULT",
        toolCallId: "ask-1",
        messageId: "t-1",
        content: '{"answer":"Postgres."}',
      },
      { type: "RUN_FINISHED" },
    ];
    const start = withUserMessage({ messages: [], error: null }, "u-1", "Which database?");
    const end = events.reduce(applyEvent, start);
    expect(end.messages).toEqual([
      expect.objectContaining({ id: "u-1", role: "user", content: "Which database?" }),
      expect.objectContaining({
        id: "f-msg",
        author: facilitator,
        toolCalls: [
          {
            id: "ask-1",
            name: "ask_member",
            arguments: '{"agentId":"a"}',
            result: '{"answer":"Postgres."}',
          },
        ],
      }),
      expect.objectContaining({ id: "m-msg", author: architect, content: "Postgres." }),
    ]);
    expect(end.error).toBeNull();
  });

  it("keeps a run's error until the next message", () => {
    const failed = applyEvent(
      { messages: [], error: null },
      { type: "RUN_ERROR", message: "No budget", code: "BUDGET_EXHAUSTED" },
    );
    expect(failed.error).toEqual({ message: "No budget", code: "BUDGET_EXHAUSTED" });
    expect(withUserMessage(failed, "u-2", "Again").error).toBeNull();
  });

  it("puts stored tool results with their calls", () => {
    const stored: AgentSessionMessage[] = [
      {
        id: "u-1",
        role: "user",
        author: { kind: "user", agentId: null, agentVersionId: null },
        content: "Hi",
        toolCalls: [],
        toolCallId: null,
        createdAt: "2026-11-24T10:00:00Z",
      },
      {
        id: "a-1",
        role: "assistant",
        author: { kind: "agent", agentId: "x", agentVersionId: "x-1" },
        content: "",
        toolCalls: [{ id: "c-1", name: "search_knowledge", arguments: "{}" }],
        toolCallId: null,
        createdAt: "2026-11-24T10:00:01Z",
      },
      {
        id: "t-1",
        role: "tool",
        author: { kind: "agent", agentId: "x", agentVersionId: "x-1" },
        content: '{"results":[]}',
        toolCalls: [],
        toolCallId: "c-1",
        createdAt: "2026-11-24T10:00:02Z",
      },
    ];
    const { messages } = conversationOf(stored);
    expect(messages).toHaveLength(2);
    expect(messages[1].toolCalls[0].result).toBe('{"results":[]}');
  });
});

describe("names", () => {
  it("names authors and members' participation", () => {
    const names = { agent: "Planner", members };
    expect(authorLabel({ kind: "user", agentId: null, agentVersionId: null }, names)).toBe("You");
    expect(authorLabel(facilitator, names)).toBe("Planner (facilitator)");
    expect(authorLabel(architect, names)).toBe("Architect");
    expect(participationLabel(members[0])).toBe("Always takes part");
    expect(participationLabel(members[1])).toBe("Joins when relevant: Anything about login");
    expect(participationLabel({ ...members[1], invited: true })).toBe("Taking part");
  });
});
