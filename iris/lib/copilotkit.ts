import "server-only";

import {
  EventType,
  HttpAgent,
  type BaseEvent,
  type Message,
  type RunAgentInput,
} from "@ag-ui/client";
import {
  AgentRunner,
  CopilotRuntime,
  createCopilotRuntimeHandler,
  type AgentRunnerConnectRequest,
  type AgentRunnerRunRequest,
  type AgentRunnerStopRequest,
} from "@copilotkit/runtime/v2";
import { catchError, concatMap, defer, from, Observable, of, switchMap } from "rxjs";

import { ApiError } from "./api/http";
import {
  createSession,
  getSession,
  listSessionMessages,
  sessionRunsUrl,
} from "./api/hephaestus";
import { aguiMessagesOf, SESSION_EVENT, sessionRunBody } from "./sessions";

/**
 * CopilotKit's runtime for a project's sessions (docs/interaction.md): the
 * session page's chat and the copilot talk to it, and it talks to the
 * session's AG-UI endpoint in Hephaestus with the person's own token, so the
 * browser never holds a token or talks to Hephaestus. It's made for each
 * request (the person's token and the session are the request's): one agent,
 * `session`, whose runs go to Hephaestus, and a runner that keeps nothing,
 * since Hephaestus keeps the conversation: connecting reads it from there.
 */

// No usage data goes to CopilotKit: its runtime checks this before each send.
process.env.COPILOTKIT_TELEMETRY_DISABLED = "true";

/** The one agent, as the browser's CopilotKit knows it. */
export const SESSION_AGENT_ID = "session";

/** A run may stream for Hephaestus's run timeout (at most 14 minutes). */
const RUN_LIMIT_MS = 15 * 60_000;

export interface SessionTarget {
  token: string;
  organizationId: string;
  projectId: string;
  /** The session, or null for the copilot's first message. */
  sessionId: string | null;
  /** The agent a new session is with (the copilot's); without it, no session starts. */
  startWith: string | null;
}

/** Runs in Hephaestus: the session's AG-UI endpoint, starting the session first when there's none. */
class HephaestusSessionAgent extends HttpAgent {
  constructor(private target: SessionTarget) {
    super({ agentId: SESSION_AGENT_ID, url: "" });
  }

  override run(input: RunAgentInput): Observable<BaseEvent> {
    let started: string | null = null;
    return defer(async () => {
      if (!this.target.sessionId) {
        started = await startSession(this.target);
        this.target = { ...this.target, sessionId: started };
      }
      const { organizationId, projectId, sessionId } = this.target;
      this.url = sessionRunsUrl(organizationId, projectId, sessionId as string).toString();
    }).pipe(
      switchMap(() => super.run(input)),
      // A new session is announced right after the run starts, so the browser remembers it.
      concatMap((event) =>
        event.type === EventType.RUN_STARTED && started
          ? of(event, {
              type: EventType.CUSTOM,
              name: SESSION_EVENT,
              value: { sessionId: started },
            } as BaseEvent)
          : of(event),
      ),
      // The runtime would report a failure as "Agent run failed": a run
      // error keeps Hephaestus's refusal (its problem details) for the page.
      catchError((error: unknown) =>
        of({
          type: EventType.RUN_ERROR,
          message: error instanceof Error ? error.message : String(error),
          code: problemCodeOf(error),
        } as BaseEvent),
      ),
    );
  }

  /** The runtime runs a copy, which must keep the session and the token. */
  override clone(): HephaestusSessionAgent {
    const copy = super.clone() as HephaestusSessionAgent;
    copy.target = this.target;
    return copy;
  }

  protected override requestInit(input: RunAgentInput): RequestInit {
    return {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.target.token}`,
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify(sessionRunBody(input, this.target.sessionId as string)),
      signal: AbortSignal.any([this.abortController.signal, AbortSignal.timeout(RUN_LIMIT_MS)]),
    };
  }
}

/** A refusal's problem code (`HTTP 409: {"code": …}`), if it has one. */
function problemCodeOf(error: unknown): string | undefined {
  const text = error instanceof Error ? error.message : "";
  const body = text.indexOf("{");
  if (body === -1) return undefined;
  try {
    const code = (JSON.parse(text.slice(body)) as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  } catch {
    return undefined;
  }
}

async function startSession(target: SessionTarget): Promise<string> {
  if (!target.startWith) throw new Error("This conversation has no session.");
  try {
    const { id } = await createSession(
      target.token,
      target.organizationId,
      target.projectId,
      { agentId: target.startWith, title: "Copilot" },
    );
    return id;
  } catch (error) {
    // Passed on as problem details, like Hephaestus's refusals of a run.
    if (error instanceof ApiError) {
      throw new Error(
        `HTTP ${error.status}: ${JSON.stringify({ code: error.code, detail: error.message })}`,
      );
    }
    throw error;
  }
}

/** The stored conversation, or null when the session has ended or is gone. */
async function storedMessages(target: SessionTarget): Promise<Message[] | null> {
  const { token, organizationId, projectId, sessionId } = target;
  if (!sessionId) return [];
  try {
    const session = await getSession(token, organizationId, projectId, sessionId);
    // The copilot carries on only an active session.
    if (target.startWith && session.status === "ended") return null;
    return aguiMessagesOf(
      await listSessionMessages(token, organizationId, projectId, sessionId),
    ) as Message[];
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}

/** Runs being streamed in this process, by thread, so Stop can abort them. */
const running = new Map<string, HttpAgent>();

/** Keeps nothing: runs go straight to Hephaestus, and connecting reads its conversation. */
class HephaestusRunner extends AgentRunner {
  constructor(private target: SessionTarget) {
    super();
  }

  run({ threadId, agent, input }: AgentRunnerRunRequest): Observable<BaseEvent> {
    return new Observable<BaseEvent>((subscriber) => {
      if (agent instanceof HttpAgent) running.set(threadId, agent);
      const subscription = (agent as HttpAgent).run(input).subscribe(subscriber);
      return () => {
        subscription.unsubscribe();
        if (running.get(threadId) === agent) running.delete(threadId);
      };
    });
  }

  connect({ threadId }: AgentRunnerConnectRequest): Observable<BaseEvent> {
    const runId = crypto.randomUUID();
    return from(storedMessages(this.target)).pipe(
      switchMap((messages) => {
        const events: BaseEvent[] = [
          { type: EventType.RUN_STARTED, threadId, runId } as BaseEvent,
          { type: EventType.MESSAGES_SNAPSHOT, messages: messages ?? [] } as BaseEvent,
        ];
        if (messages === null) {
          // Ended or gone: the browser forgets it, and the next message starts a new one.
          events.push({
            type: EventType.CUSTOM,
            name: SESSION_EVENT,
            value: { sessionId: null },
          } as BaseEvent);
        }
        events.push({ type: EventType.RUN_FINISHED, threadId, runId } as BaseEvent);
        return of(...events);
      }),
    );
  }

  async isRunning(): Promise<boolean> {
    return false;
  }

  async stop({ threadId }: AgentRunnerStopRequest): Promise<boolean> {
    const agent = running.get(threadId);
    agent?.abortRun();
    return agent !== undefined;
  }
}

/** Handles one request to the runtime, for the person and the session it names. */
export function handleCopilotKit(
  request: Request,
  target: SessionTarget,
  basePath: string,
): Promise<Response> {
  const runtime = new CopilotRuntime({
    agents: { [SESSION_AGENT_ID]: new HephaestusSessionAgent(target) },
    runner: new HephaestusRunner(target),
  });
  return Promise.resolve(createCopilotRuntimeHandler({ runtime, basePath })(request));
}
