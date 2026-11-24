"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { buttonClass, FormError, inputClass } from "@/app/components/form";
import type { AgentSessionMessage, SessionMember } from "@/lib/api";
import {
  applyEvent,
  authorLabel,
  conversationOf,
  refusalMessage,
  runErrorMessage,
  SseParser,
  withUserMessage,
  type ChatMessage,
  type Conversation,
} from "@/lib/sessions";

import type { ProjectRef } from "../../actions";

/**
 * The conversation, and sending a message: the run's AG-UI events stream
 * through Iris's route (`runs/route.ts`) and update the conversation as they
 * come. In a council session the person can address one member directly.
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
  const [conversation, setConversation] = useState<Conversation>(() =>
    conversationOf(initial),
  );
  const [text, setText] = useState("");
  const [addressed, setAddressed] = useState("");
  const [running, setRunning] = useState(false);
  const [refused, setRefused] = useState<string | undefined>();
  const stop = useRef<AbortController | null>(null);
  const names = { agent: agentName, members };
  const council = members.length > 0;

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const content = text.trim();
    if (!content || running) return;
    const messageId = crypto.randomUUID();
    setRefused(undefined);
    setText("");
    setRunning(true);
    setConversation((current) => withUserMessage(current, messageId, content));
    const controller = new AbortController();
    stop.current = controller;
    try {
      const response = await fetch(
        `/orgs/${project.organizationId}/projects/${project.projectId}/sessions/${sessionId}/runs`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messageId,
            content,
            ...(addressed ? { memberAgentId: addressed } : {}),
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok || !response.body) {
        const problem = (await response.json().catch(() => ({}))) as {
          code?: string;
          detail?: string;
        };
        // Nothing was kept: take the message back.
        setConversation((current) => ({
          ...current,
          messages: current.messages.filter((message) => message.id !== messageId),
        }));
        setText(content);
        setRefused(refusalMessage(problem.code, problem.detail ?? ""));
        return;
      }
      const parser = new SseParser();
      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const events = parser.push(value);
        if (events.length > 0) {
          setConversation((current) => events.reduce(applyEvent, current));
        }
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setRefused("The connection was lost. What the agent said so far is kept.");
      }
    } finally {
      stop.current = null;
      setRunning(false);
      // The stored conversation and the session's state (members invited).
      router.refresh();
    }
  }

  return (
    <section className="space-y-4">
      <ol className="space-y-3" aria-live="polite">
        {conversation.messages.length === 0 && (
          <li className="text-sm text-zinc-600 dark:text-zinc-400">
            {ended ? "Nothing was said." : "Say what you'd like to talk about."}
          </li>
        )}
        {conversation.messages.map((message) => (
          <Message key={message.id} message={message} label={authorLabel(message.author, names)} />
        ))}
        {running && (
          <li className="text-sm text-zinc-500" role="status">
            Answering…
          </li>
        )}
      </ol>
      {conversation.error && !running && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {runErrorMessage(conversation.error)}
        </p>
      )}

      {ended ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This session has ended. Start a new one to carry on.
        </p>
      ) : (
        <form onSubmit={send} className="space-y-2">
          <FormError error={refused} />
          <label className="block text-sm">
            Message
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              rows={3}
              maxLength={100_000}
              className={inputClass}
              placeholder="Enter to send, Shift+Enter for a new line"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            {council && (
              <label className="text-sm">
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
            <button type="submit" disabled={running || !text.trim()} className={buttonClass}>
              {running ? "Answering…" : "Send"}
            </button>
            {running && (
              <button
                type="button"
                onClick={() => stop.current?.abort()}
                className="text-sm underline"
              >
                Stop
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

function Message({ message, label }: { message: ChatMessage; label: string }) {
  const mine = message.role === "user";
  return (
    <li className={mine ? "flex justify-end" : "flex"}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          mine
            ? "bg-indigo-600 text-white"
            : message.author.kind === "member"
              ? "border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950"
              : "border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
        }`}
      >
        <p className={`mb-1 text-xs font-medium ${mine ? "text-indigo-100" : "text-zinc-500"}`}>
          {label}
        </p>
        {message.content && <p className="whitespace-pre-wrap">{message.content}</p>}
        {message.toolCalls.map((call) => (
          <details key={call.id} className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            <summary className="cursor-pointer">
              {call.name === "ask_member"
                ? "Asked a member"
                : call.name === "invite_members"
                  ? "Invited members"
                  : `Used ${call.name}`}
              {call.result === null ? "…" : ""}
            </summary>
            <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">{call.arguments}</pre>
            {call.result !== null && (
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all">{call.result}</pre>
            )}
          </details>
        ))}
      </div>
    </li>
  );
}
