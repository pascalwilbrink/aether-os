"use client";

import "@copilotkit/react-core/v2/styles.css";

import {
  CopilotChat,
  CopilotChatAssistantMessage,
  CopilotKitProvider,
  defineToolCallRenderer,
  type CopilotChatAssistantMessageProps,
} from "@copilotkit/react-core/v2";
import { useRouter } from "next/navigation";
import { createContext, useContext, useState } from "react";

import { useSessionRunEvents } from "@/app/components/session-run-events";
import type { AgentSessionMessage, SessionAuthor, SessionMember } from "@/lib/api";
import { authorLabel, authorsOf, copilotKitPath, SESSION_HEADER } from "@/lib/sessions";

import type { ProjectRef } from "../../actions";

/** The one agent CopilotKit talks to on this page: the session. */
const AGENT_ID = "session";

/** Who wrote each message, and how to name them. */
const Authors = createContext<{
  authors: ReadonlyMap<string, SessionAuthor>;
  label: (author: SessionAuthor) => string;
}>({ authors: new Map(), label: () => "" });

/**
 * The conversation, on CopilotKit (`docs/interaction.md`): its runtime is
 * Iris's (`lib/copilotkit.ts`, at `…/copilotkit`), which reads the stored
 * conversation from Hephaestus and runs the session's endpoint there with the
 * person's token, so the browser never sees a token or Hephaestus. Each
 * message shows who wrote it: Hephaestus announces them with
 * `message-author` events. In a council session the person can address a
 * member directly (`forwardedProps.memberAgentId`, through the provider's
 * `properties`).
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
  const [addressed, setAddressed] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  return (
    <section className="space-y-3">
      <CopilotKitProvider
        runtimeUrl={copilotKitPath(project)}
        headers={{ [SESSION_HEADER]: sessionId }}
        agentId={AGENT_ID}
        properties={addressed ? { memberAgentId: addressed } : {}}
        renderToolCalls={TOOL_RENDERERS}
        showDevConsole={false}
        enableInspector={false}
      >
        <Conversation
          sessionId={sessionId}
          initial={initial}
          agentName={agentName}
          members={members}
          ended={ended}
          onFailure={setFailure}
        />
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

/** The chat, and who wrote each message (inside the provider). */
function Conversation({
  sessionId,
  initial,
  agentName,
  members,
  ended,
  onFailure,
}: {
  sessionId: string;
  initial: AgentSessionMessage[];
  agentName: string;
  members: SessionMember[];
  ended: boolean;
  onFailure: (message: string | null) => void;
}) {
  const router = useRouter();
  const [authors, setAuthors] = useState(() => authorsOf(initial));
  useSessionRunEvents(AGENT_ID, {
    onAuthor: (messageId, author) =>
      setAuthors((current) => new Map(current).set(messageId, author)),
    onFailure,
    // The stored conversation and the session's state (members invited).
    onFinalized: () => router.refresh(),
  });
  const context = {
    authors,
    label: (author: SessionAuthor) => authorLabel(author, { agent: agentName, members }),
  };
  return (
    <Authors.Provider value={context}>
      <div className="h-[60vh] min-h-96 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
        <CopilotChat
          agentId={AGENT_ID}
          threadId={sessionId}
          messageView={{ assistantMessage: AuthoredAssistant }}
          labels={{
            chatInputPlaceholder: ended ? "This session has ended." : "Write a message",
          }}
          {...(ended ? { input: Ended } : {})}
        />
      </div>
    </Authors.Provider>
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
