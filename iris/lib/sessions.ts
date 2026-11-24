import type {
  AgentSession,
  AgentSessionMessage,
  SessionAuthor,
  SessionMember,
} from "./api";

/**
 * Sessions in Iris (docs/interaction.md, docs/councils.md): the stored
 * conversation as CopilotKit's agent starts from it, who wrote each
 * message, and what the page says. Pure, so it can be tested and used in
 * the browser.
 */

/** An AG-UI message, as CopilotKit's agent keeps the conversation. */
export type AguiMessage =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      toolCalls?: {
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }[];
    }
  | { id: string; role: "tool"; content: string; toolCallId: string };

/**
 * The stored messages as the agent's starting conversation (AG-UI
 * messages, with Hephaestus's IDs, so a run sends none of them again as
 * new).
 */
export function aguiMessagesOf(
  stored: readonly AgentSessionMessage[],
): AguiMessage[] {
  return stored.flatMap((message): AguiMessage[] => {
    if (message.role === "user") {
      return [{ id: message.id, role: "user", content: message.content }];
    }
    if (message.role === "tool") {
      return message.toolCallId
        ? [
            {
              id: message.id,
              role: "tool",
              content: message.content,
              toolCallId: message.toolCallId,
            },
          ]
        : [];
    }
    return [
      {
        id: message.id,
        role: "assistant",
        content: message.content,
        ...(message.toolCalls.length > 0
          ? {
              toolCalls: message.toolCalls.map((call) => ({
                id: call.id,
                type: "function" as const,
                function: { name: call.name, arguments: call.arguments },
              })),
            }
          : {}),
      },
    ];
  });
}

/** Who wrote each stored message, by its ID. */
export function authorsOf(
  stored: readonly AgentSessionMessage[],
): Map<string, SessionAuthor> {
  return new Map(stored.map((message) => [message.id, message.author]));
}

/**
 * A `message-author` event (Hephaestus announces each assistant message
 * of a run with one): the message and who wrote it, or null for any other
 * custom event.
 */
export function authorEvent(event: {
  name?: string;
  value?: unknown;
}): { messageId: string; author: SessionAuthor } | null {
  const value = event.value as
    | { messageId?: unknown; author?: SessionAuthor }
    | undefined;
  return event.name === "message-author" &&
    typeof value?.messageId === "string" &&
    value.author
    ? { messageId: value.messageId, author: value.author }
    : null;
}

/**
 * What went wrong with a run, for the person: a refusal before it started
 * (Iris's route passes Hephaestus's problem details on, which CopilotKit's
 * agent reports as an HTTP error with the body) or a `RUN_ERROR`.
 */
export function runFailureMessage(error: { message?: string; code?: string }): string {
  const text = error.message ?? "";
  const body = text.indexOf("{");
  if (body !== -1) {
    try {
      const problem = JSON.parse(text.slice(body)) as {
        code?: string;
        detail?: string;
      };
      if (problem.code || problem.detail) {
        return refusalMessage(problem.code, problem.detail ?? "");
      }
    } catch {
      // Not problem details.
    }
  }
  return runErrorMessage({ message: text || "The run failed.", code: error.code ?? "" });
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
