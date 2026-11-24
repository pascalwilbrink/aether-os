"use client";

import "@copilotkit/react-core/v2/styles.css";

import {
  CopilotChat,
  CopilotChatAssistantMessage,
  CopilotKitProvider,
  defineToolCallRenderer,
  EventType,
  HttpAgent,
  type BaseEvent,
  type CopilotChatAssistantMessageProps,
  type HttpAgentConfig,
  type Message,
  type RunAgentInput,
} from "@copilotkit/react-core/v2";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Observable } from "rxjs";

import type { AgentSessionMessage, SessionAuthor, SessionMember } from "@/lib/api";
import {
  aguiMessagesOf,
  authorEvent,
  authorLabel,
  authorsOf,
  runFailureMessage,
} from "@/lib/sessions";

import type { ProjectRef } from "../../actions";

/** The one agent CopilotKit talks to on this page: the session. */
const AGENT_ID = "session";

/**
 * The session's agent. CopilotKit empties an agent's conversation when it
 * first connects to a thread and asks the agent to restore it (`connect`),
 * which `HttpAgent` can't: this one replays the stored messages as a
 * snapshot. Every run then carries them with Hephaestus's IDs, so it
 * stores only what's new.
 */
class SessionAgent extends HttpAgent {
  constructor(
    config: HttpAgentConfig,
    private readonly stored: Message[],
  ) {
    super(config);
  }

  protected override connect(input: RunAgentInput): Observable<BaseEvent> {
    const { threadId, runId } = input;
    return new Observable<BaseEvent>((subscriber) => {
      subscriber.next({ type: EventType.RUN_STARTED, threadId, runId } as BaseEvent);
      subscriber.next({
        type: EventType.MESSAGES_SNAPSHOT,
        messages: this.stored,
      } as BaseEvent);
      subscriber.next({ type: EventType.RUN_FINISHED, threadId, runId } as BaseEvent);
      subscriber.complete();
    });
  }

  override clone(): SessionAgent {
    const copy = super.clone() as SessionAgent;
    Object.assign(copy, { stored: this.stored });
    return copy;
  }
}

/** Who wrote each message, and how to name them. */
const Authors = createContext<{
  authors: ReadonlyMap<string, SessionAuthor>;
  label: (author: SessionAuthor) => string;
}>({ authors: new Map(), label: () => "" });

/**
 * The conversation, on CopilotKit (`docs/interaction.md`): its agent is an
 * AG-UI `HttpAgent` on Iris's route (`runs/route.ts`), which calls the
 * session's endpoint in Hephaestus with the person's token, so the browser
 * never sees a token or Hephaestus. It starts from the stored messages
 * (Hephaestus's IDs, so they're never sent as new), and each message shows
 * who wrote it: Hephaestus announces them with `message-author` events. In
 * a council session the person can address a member directly
 * (`forwardedProps.memberAgentId`, through the provider's `properties`).
 */
export function SessionChat({
  project,
  sessionId,
  initial,
  agentName,
  members,
  ended,
}: {
  project: ProjectRef;
  sessionId: string;
  initial: AgentSessionMessage[];
  agentName: string;
  members: SessionMember[];
  ended: boolean;
}) {
  const router = useRouter();
  const [agent] = useState(() => {
    const stored = aguiMessagesOf(initial) as Message[];
    return new SessionAgent(
      {
        agentId: AGENT_ID,
        url: `/orgs/${project.organizationId}/projects/${project.projectId}/sessions/${sessionId}/runs`,
        threadId: sessionId,
        initialMessages: stored,
      },
      stored,
    );
  });
  const [authors, setAuthors] = useState(() => authorsOf(initial));
  const [addressed, setAddressed] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    const { unsubscribe } = agent.subscribe({
      onRunInitialized: () => setFailure(null),
      onCustomEvent: ({ event }) => {
        const announced = authorEvent(event);
        if (announced) {
          setAuthors((current) =>
            new Map(current).set(announced.messageId, announced.author),
          );
        }
      },
      onRunErrorEvent: ({ event }) =>
        setFailure(runFailureMessage({ message: event.message, code: event.code })),
      onRunFailed: ({ error }) => {
        setFailure(runFailureMessage(error));
        // Refused before it started: Hephaestus kept nothing, so neither do we.
        const last = agent.messages.at(-1);
        if ("status" in error && last?.role === "user") {
          agent.setMessages(agent.messages.slice(0, -1));
        }
      },
      // The stored conversation and the session's state (members invited).
      onRunFinalized: () => router.refresh(),
    });
    return unsubscribe;
  }, [agent, router]);

  const context = useMemo(
    () => ({
      authors,
      label: (author: SessionAuthor) => authorLabel(author, { agent: agentName, members }),
    }),
    [authors, agentName, members],
  );
  const properties = useMemo(
    () => (addressed ? { memberAgentId: addressed } : {}),
    [addressed],
  );

  return (
    <section className="space-y-3">
      <CopilotKitProvider
        selfManagedAgents={{ [AGENT_ID]: agent }}
        agentId={AGENT_ID}
        properties={properties}
        renderToolCalls={TOOL_RENDERERS}
        showDevConsole={false}
        enableInspector={false}
      >
        <Authors.Provider value={context}>
          <div className="h-[60vh] min-h-96 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
            <CopilotChat
              agentId={AGENT_ID}
              threadId={sessionId}
              messageView={{ assistantMessage: AuthoredAssistant }}
              labels={{
                chatInputPlaceholder: ended
                  ? "This session has ended."
                  : "Write a message",
              }}
              {...(ended ? { input: Ended } : {})}
            />
          </div>
        </Authors.Provider>
      </CopilotKitProvider>
      {failure && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {failure}
        </p>
      )}
      {members.length > 0 && !ended && (
        <label className="block text-sm">
          To{" "}
          <select
            value={addressed}
            onChange={(event) => setAddressed(event.target.value)}
            className="rounded-md border border-zinc-300 bg-transparent px-2 py-1 dark:border-zinc-700"
          >
            <option value="">The facilitator</option>
            {members.map((member) => (
              <option key={member.agentId} value={member.agentId}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}

/** An assistant message, with who wrote it above it; members' stand out. */
function AuthoredAssistantMessage(props: CopilotChatAssistantMessageProps) {
  const { authors, label } = useContext(Authors);
  const author = authors.get(props.message.id);
  return (
    <div
      className={
        author?.kind === "member"
          ? "rounded-md border-l-4 border-amber-400 pl-2"
          : undefined
      }
    >
      {author && (
        <p className="mb-1 text-xs font-medium text-zinc-500">{label(author)}</p>
      )}
      <CopilotChatAssistantMessage {...props} />
    </div>
  );
}

/** The slot's type wants the default's sub-components too; it only renders it. */
const AuthoredAssistant =
  AuthoredAssistantMessage as unknown as typeof CopilotChatAssistantMessage;

/** In place of the message box, once the session has ended. */
function Ended() {
  return (
    <p className="p-3 text-sm text-zinc-600 dark:text-zinc-400">
      This session has ended. Start a new one to carry on.
    </p>
  );
}

/** Tool calls, folded: the council's own in words, any other by name. */
const TOOL_RENDERERS = [
  defineToolCallRenderer({
    name: "*",
    render: ({ name, args, status, result }) => (
      <details className="my-1 text-xs text-zinc-600 dark:text-zinc-400">
        <summary className="cursor-pointer">
          {name === "ask_member"
            ? "Asked a member"
            : name === "invite_members"
              ? "Invited members"
              : `Used ${name}`}
          {status === "complete" ? "" : "…"}
        </summary>
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(args, null, 2)}
        </pre>
        {result !== undefined && (
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">
            {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
          </pre>
        )}
      </details>
    ),
  }),
];
