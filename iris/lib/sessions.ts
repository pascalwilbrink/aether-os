import type {
  AgentSession,
  AgentSessionMessage,
  SessionAuthor,
  SessionMember,
} from "./api";

/**
 * Sessions in Iris (docs/interaction.md, docs/councils.md): reading the
 * AG-UI events a run streams, and keeping the conversation they and the
 * stored messages make. Pure, so it can be tested and used in the browser.
 */

/** An AG-UI event as Hephaestus sends it. */
export interface AguiEvent {
  type: string;
  messageId?: string;
  delta?: string;
  toolCallId?: string;
  toolCallName?: string;
  parentMessageId?: string;
  content?: string;
  name?: string;
  value?: unknown;
  message?: string;
  code?: string;
}

/**
 * Splits a server-sent event stream into its events (`data: <json>`
 * frames separated by a blank line), whatever chunks it arrives in.
 */
export class SseParser {
  private buffer = "";

  push(chunk: string): AguiEvent[] {
    this.buffer += chunk.replace(/\r\n/g, "\n");
    const events: AguiEvent[] = [];
    let end = this.buffer.indexOf("\n\n");
    while (end !== -1) {
      const frame = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) {
        try {
          events.push(JSON.parse(data) as AguiEvent);
        } catch {
          // Not an event: skipped.
        }
      }
      end = this.buffer.indexOf("\n\n");
    }
    return events;
  }
}

/** A tool call in the conversation, with its result once it came. */
export interface ChatToolCall {
  id: string;
  name: string;
  arguments: string;
  result: string | null;
}

/** A message as the conversation shows it; tool results sit with their calls. */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  author: SessionAuthor;
  content: string;
  toolCalls: ChatToolCall[];
}

export interface Conversation {
  messages: ChatMessage[];
  /** A run's `RUN_ERROR`, until the next run. */
  error: { message: string; code: string } | null;
}

const PERSON: SessionAuthor = { kind: "user", agentId: null, agentVersionId: null };

/** The stored messages as a conversation: tool results go to their calls. */
export function conversationOf(stored: readonly AgentSessionMessage[]): Conversation {
  const messages: ChatMessage[] = [];
  const calls = new Map<string, ChatToolCall>();
  for (const message of stored) {
    if (message.role === "tool") {
      const call = message.toolCallId ? calls.get(message.toolCallId) : undefined;
      if (call) {
        call.result = message.content;
      }
      continue;
    }
    const toolCalls = message.toolCalls.map((call) => ({
      id: call.id,
      name: call.name,
      arguments: call.arguments,
      result: null,
    }));
    for (const call of toolCalls) {
      calls.set(call.id, call);
    }
    messages.push({
      id: message.id,
      role: message.role,
      author: message.author,
      content: message.content,
      toolCalls,
    });
  }
  return { messages, error: null };
}

/** The person's message, before the run answers it. */
export function withUserMessage(
  conversation: Conversation,
  id: string,
  content: string,
): Conversation {
  return {
    messages: [
      ...conversation.messages,
      { id, role: "user", author: PERSON, content, toolCalls: [] },
    ],
    error: null,
  };
}

/**
 * The conversation after one AG-UI event. Each assistant message is
 * announced by a `message-author` event (who wrote it); text and tool
 * calls go into it, tool results onto their calls.
 */
export function applyEvent(
  conversation: Conversation,
  event: AguiEvent,
): Conversation {
  const messages = conversation.messages;
  const update = (
    id: string,
    change: (message: ChatMessage) => ChatMessage,
  ): ChatMessage[] => {
    const index = messages.findIndex((message) => message.id === id);
    if (index === -1) {
      return [
        ...messages,
        change({
          id,
          role: "assistant",
          author: { kind: "agent", agentId: null, agentVersionId: null },
          content: "",
          toolCalls: [],
        }),
      ];
    }
    return messages.map((message, at) => (at === index ? change(message) : message));
  };
  switch (event.type) {
    case "CUSTOM": {
      const value = event.value as
        | { messageId?: string; author?: SessionAuthor }
        | undefined;
      if (event.name !== "message-author" || !value?.messageId || !value.author) {
        return conversation;
      }
      const author = value.author;
      return {
        ...conversation,
        messages: update(value.messageId, (message) => ({ ...message, author })),
      };
    }
    case "TEXT_MESSAGE_START":
      return event.messageId
        ? { ...conversation, messages: update(event.messageId, (message) => message) }
        : conversation;
    case "TEXT_MESSAGE_CONTENT":
      return event.messageId
        ? {
            ...conversation,
            messages: update(event.messageId, (message) => ({
              ...message,
              content: message.content + (event.delta ?? ""),
            })),
          }
        : conversation;
    case "TOOL_CALL_START":
      return event.parentMessageId && event.toolCallId
        ? {
            ...conversation,
            messages: update(event.parentMessageId, (message) => ({
              ...message,
              toolCalls: [
                ...message.toolCalls,
                {
                  id: event.toolCallId as string,
                  name: event.toolCallName ?? "tool",
                  arguments: "",
                  result: null,
                },
              ],
            })),
          }
        : conversation;
    case "TOOL_CALL_ARGS":
    case "TOOL_CALL_RESULT": {
      const callId = event.toolCallId;
      if (!callId) {
        return conversation;
      }
      return {
        ...conversation,
        messages: messages.map((message) =>
          message.toolCalls.some((call) => call.id === callId)
            ? {
                ...message,
                toolCalls: message.toolCalls.map((call) =>
                  call.id !== callId
                    ? call
                    : event.type === "TOOL_CALL_ARGS"
                      ? { ...call, arguments: call.arguments + (event.delta ?? "") }
                      : { ...call, result: event.content ?? "" },
                ),
              }
            : message,
        ),
      };
    }
    case "RUN_ERROR":
      return {
        ...conversation,
        error: {
          message: event.message ?? "The run failed.",
          code: event.code ?? "AGENT_FAILED",
        },
      };
    default:
      return conversation;
  }
}

/** Who wrote a message, as the conversation names them. */
export function authorLabel(
  author: SessionAuthor,
  names: { agent: string; members: readonly SessionMember[] },
): string {
  switch (author.kind) {
    case "user":
      return "You";
    case "agent":
      return names.agent;
    case "facilitator":
      return `${names.agent} (facilitator)`;
    case "member":
      return (
        names.members.find((member) => member.agentId === author.agentId)?.name ??
        "A member"
      );
  }
}

/** What a run's error code means for the person. */
export function runErrorMessage(error: { message: string; code: string }): string {
  switch (error.code) {
    case "BUDGET_EXHAUSTED":
      return `A budget ran out: ${error.message} Raise it on the project's or the organization's budget page, then try again.`;
    case "RUN_TIMEOUT":
      return "The answer took too long and was stopped. Try a narrower question.";
    case "RUN_STOPPED":
      return "The answer was stopped.";
    case "TOOL_SERVER_UNAVAILABLE":
      return `One of the agent's tool servers couldn't be reached: ${error.message}`;
    default:
      return error.message;
  }
}

/** Why Hephaestus refused a run, for the person. */
export function refusalMessage(code: string | undefined, detail: string): string {
  switch (code) {
    case "SESSION_BUSY":
      return "The agent is still answering. Wait for it to finish.";
    case "SESSION_ENDED":
      return "This session has ended: start a new one to carry on.";
    case "SESSION_MEMBER_INVALID":
      return detail;
    default:
      return detail || "The message couldn't be sent.";
  }
}

/** The session's status, as a label and colours. */
export function sessionStatus(session: Pick<AgentSession, "status" | "endedReason" | "running">): {
  label: string;
  classes: string;
} {
  if (session.status === "ended") {
    return {
      label: session.endedReason === "idle" ? "Ended (idle)" : "Ended",
      classes: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    };
  }
  return session.running
    ? { label: "Answering", classes: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200" }
    : { label: "Active", classes: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" };
}

/** A member's participation, in words. */
export function participationLabel(member: SessionMember): string {
  if (member.participation === "required") {
    return "Always takes part";
  }
  if (member.invited) {
    return "Taking part";
  }
  return member.participation === "conditional"
    ? `Joins when relevant${member.when ? `: ${member.when}` : ""}`
    : "Joins when invited";
}
