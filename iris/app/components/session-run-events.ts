"use client";

import { useAgent } from "@copilotkit/react-core/v2";
import { useEffect, useRef } from "react";

import type { SessionAuthor } from "@/lib/api";
import {
  authorEvent,
  isRefusal,
  runFailureMessage,
  sessionEventOf,
} from "@/lib/sessions";

/**
 * What a session's runs say beyond the chat (inside a `CopilotKitProvider`
 * whose runtime is Iris's, `lib/copilotkit.ts`): who wrote each message,
 * the copilot's session starting or being gone, why a run failed (a refused
 * one takes the person's message back: Hephaestus kept nothing), and a
 * run's end.
 */
export function useSessionRunEvents(
  agentId: string,
  handlers: {
    onAuthor?: (messageId: string, author: SessionAuthor) => void;
    onSession?: (sessionId: string | null) => void;
    onFailure: (message: string | null) => void;
    onFinalized?: () => void;
  },
) {
  const { agent } = useAgent({ agentId });
  // The latest handlers, without subscribing again for each render.
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const fail = (message: string | undefined, code?: string) => {
      latest.current.onFailure(runFailureMessage({ message, code }));
      const last = agent.messages.at(-1);
      if (isRefusal(message) && last?.role === "user") {
        agent.setMessages(agent.messages.slice(0, -1));
      }
    };
    const { unsubscribe } = agent.subscribe({
      onRunInitialized: () => latest.current.onFailure(null),
      onCustomEvent: ({ event }) => {
        const author = authorEvent(event);
        if (author) latest.current.onAuthor?.(author.messageId, author.author);
        const session = sessionEventOf(event);
        if (session) latest.current.onSession?.(session.sessionId);
      },
      onRunErrorEvent: ({ event }) => fail(event.message, event.code),
      onRunFailed: ({ error }) => fail(error.message),
      onRunFinalized: () => latest.current.onFinalized?.(),
    });
    return unsubscribe;
  }, [agent]);

  return agent;
}
