import { sessionRunsUrl } from "@/lib/api/hephaestus";
import { currentSession } from "@/lib/auth/current";

/** A run may stream for Hephaestus's run timeout (at most 14 minutes). */
const RUN_LIMIT_MS = 15 * 60_000;

/**
 * The session's AG-UI endpoint as the page's CopilotKit agent (an
 * `HttpAgent`) sees it: the `RunAgentInput` it sends goes to Hephaestus's
 * (docs/interaction.md) with the person's own token, the session as
 * `threadId`, and only what Hephaestus reads (`messages`, `tools`,
 * `context`, `state`, and `memberAgentId` of `forwardedProps`; CopilotKit's
 * own properties stay here); the run's events stream back as they come.
 * Refusals before the stream (busy, ended, an addressed member that isn't
 * one) come back as problem details.
 */
export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      projectId: string;
      sessionId: string;
    }>;
  },
) {
  const { organizationId, projectId, sessionId } = await params;
  const session = await currentSession();
  if (!session || session.organizationId !== organizationId) {
    return Response.json(
      { detail: "Sign in again to carry on this session." },
      { status: 401 },
    );
  }
  const input = (await request.json().catch(() => null)) as {
    runId?: unknown;
    messages?: unknown;
    tools?: unknown;
    context?: unknown;
    state?: unknown;
    forwardedProps?: { memberAgentId?: unknown } | null;
  } | null;
  if (!input || !Array.isArray(input.messages)) {
    return Response.json({ detail: "Write a message." }, { status: 400 });
  }
  const memberAgentId = input.forwardedProps?.memberAgentId;

  let upstream: Response;
  try {
    upstream = await fetch(sessionRunsUrl(organizationId, projectId, sessionId), {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        threadId: sessionId,
        runId:
          typeof input.runId === "string" && input.runId
            ? input.runId
            : crypto.randomUUID(),
        messages: input.messages,
        ...(Array.isArray(input.tools) ? { tools: input.tools } : {}),
        ...(Array.isArray(input.context) ? { context: input.context } : {}),
        ...(input.state !== undefined ? { state: input.state } : {}),
        ...(typeof memberAgentId === "string" && memberAgentId
          ? { forwardedProps: { memberAgentId } }
          : {}),
      }),
      cache: "no-store",
      // The person leaving or pressing Stop stops the run (Hephaestus keeps
      // what it produced).
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(RUN_LIMIT_MS)]),
    });
  } catch {
    return Response.json(
      { detail: "Hephaestus can't be reached right now. Try again in a moment." },
      { status: 503 },
    );
  }
  if (!upstream.ok || !upstream.body) {
    const problem = (await upstream.json().catch(() => ({}))) as {
      code?: string;
      detail?: string;
    };
    return Response.json(
      { code: problem.code, detail: problem.detail ?? upstream.statusText },
      { status: upstream.status === 200 ? 502 : upstream.status },
    );
  }
  return new Response(upstream.body, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
