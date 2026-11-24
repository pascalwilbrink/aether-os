import { describe, expect, it } from "vitest";

import type { AgentSessionMessage, SessionMember } from "./api";
import {
  aguiMessagesOf,
  authorEvent,
  authorLabel,
  authorsOf,
  participationLabel,
  runFailureMessage,
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

describe("the stored conversation", () => {
  it("becomes the agent's AG-UI messages, tool results after their calls", () => {
    expect(aguiMessagesOf(stored)).toEqual([
      { id: "u-1", role: "user", content: "Hi" },
      {
        id: "a-1",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "c-1",
            type: "function",
            function: { name: "search_knowledge", arguments: "{}" },
          },
        ],
      },
      { id: "t-1", role: "tool", content: '{"results":[]}', toolCallId: "c-1" },
    ]);
  });

  it("leaves out a tool result without its call", () => {
    expect(aguiMessagesOf([{ ...stored[2], toolCallId: null }])).toEqual([]);
  });

  it("knows who wrote each message", () => {
    expect(authorsOf(stored).get("a-1")).toEqual(stored[1].author);
  });
});

describe("authors announced in a run", () => {
  it("reads message-author events and ignores other custom events", () => {
    expect(
      authorEvent({ name: "message-author", value: { messageId: "m", author: architect } }),
    ).toEqual({ messageId: "m", author: architect });
    expect(authorEvent({ name: "other", value: { messageId: "m", author: architect } })).toBeNull();
    expect(authorEvent({ name: "message-author", value: {} })).toBeNull();
  });
});

describe("a failed run", () => {
  it("says why Hephaestus refused it, from the problem details in the error", () => {
    expect(
      runFailureMessage({
        message: 'HTTP 409: {"code":"SESSION_BUSY","detail":"Busy."}',
      }),
    ).toBe("The agent is still answering. Wait for it to finish.");
  });

  it("says what a run error means", () => {
    expect(runFailureMessage({ message: "Stopped.", code: "RUN_STOPPED" })).toBe(
      "The answer was stopped.",
    );
    expect(runFailureMessage({ message: "Something broke." })).toBe("Something broke.");
    expect(runFailureMessage({})).toBe("The run failed.");
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
