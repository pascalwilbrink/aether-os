import { sessionRunsUrl } from "@/lib/api/hephaestus";
import { currentSession } from "@/lib/auth/current";

/** A run may stream for Hephaestus's run timeout (at most 14 minutes). */
const RUN_LIMIT_MS = 15 * 60_000;

/**
 * Sends the person's message to the session's AG-UI endpoint in Hephaestus
 * (docs/interaction.md) with their own token, and streams the run's events
 * back as they come. Refusals before the stream (busy, ended, an
 * addressed member that isn't one) come back as problem details.
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
  const body = (await request.json().catch(() => null)) as {
    messageId?: unknown;
    content?: unknown;
    memberAgentId?: unknown;
  } | null;
  if (
    !body ||
    typeof body.messageId !== "string" ||
    typeof body.content !== "string" ||
    !body.content.trim()
  ) {
    return Response.json({ detail: "Write a message." }, { status: 400 });
  }
  const memberAgentId =
    typeof body.memberAgentId === "string" && body.memberAgentId
      ? body.memberAgentId
      : undefined;

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
        runId: crypto.randomUUID(),
        messages: [{ id: body.messageId, role: "user", content: body.content }],
        ...(memberAgentId ? { forwardedProps: { memberAgentId } } : {}),
      }),
      cache: "no-store",
      // The person leaving stops the run (Hephaestus keeps what it produced).
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
