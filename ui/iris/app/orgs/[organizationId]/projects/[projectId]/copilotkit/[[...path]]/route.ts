import { currentSession } from "@/lib/auth/current";
import { handleCopilotKit } from "@/lib/copilotkit";
import { AGENT_HEADER, copilotKitPath, SESSION_HEADER } from "@/lib/sessions";

type Context = {
  params: Promise<{ organizationId: string; projectId: string }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * CopilotKit's runtime for the project's sessions (`lib/copilotkit.ts`):
 * the session page and the copilot send their runs here, naming the
 * session (`x-iris-session`) and, for the copilot's first message, the
 * agent to start one with (`x-iris-agent`); the person is the signed-in one.
 */
async function handle(request: Request, { params }: Context): Promise<Response> {
  const { organizationId, projectId } = await params;
  const session = await currentSession();
  if (!session || session.organizationId !== organizationId) {
    return Response.json(
      { detail: "Sign in again to carry on this conversation." },
      { status: 401 },
    );
  }
  const uuid = (value: string | null) => (value && UUID.test(value) ? value : null);
  return handleCopilotKit(
    request,
    {
      token: session.accessToken,
      organizationId,
      projectId,
      sessionId: uuid(request.headers.get(SESSION_HEADER)),
      startWith: uuid(request.headers.get(AGENT_HEADER)),
    },
    copilotKitPath({ organizationId, projectId }),
  );
}

export const GET = handle;
export const POST = handle;
