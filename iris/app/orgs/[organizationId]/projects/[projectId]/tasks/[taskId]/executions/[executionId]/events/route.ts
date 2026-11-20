import { unstable_rethrow } from "next/navigation";

import { ApiError } from "@/lib/api/http";
import { listExecutionEvents } from "@/lib/api/hephaestus";
import { currentSession } from "@/lib/auth/current";

/**
 * An execution's activity after `?after=` (docs/tasks.md, Activity), for
 * the task page to follow while it runs: Hephaestus's answer, asked with
 * the person's own token (`task:read`).
 */
export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      projectId: string;
      taskId: string;
      executionId: string;
    }>;
  },
) {
  const { organizationId, projectId, taskId, executionId } = await params;
  const session = await currentSession();
  if (!session || session.organizationId !== organizationId) {
    return Response.json(
      { detail: "Sign in again to follow this task." },
      { status: 401 },
    );
  }
  const after = Math.max(
    0,
    Number.parseInt(
      new URL(request.url).searchParams.get("after") ?? "0",
      10,
    ) || 0,
  );
  try {
    return Response.json(
      await listExecutionEvents(
        session.accessToken,
        organizationId,
        projectId,
        taskId,
        executionId,
        after,
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    // A refused token signs the person out, as on any page (lib/api/http.ts).
    unstable_rethrow(error);
    const status =
      error instanceof ApiError && error.status < 500 ? error.status : 503;
    return Response.json(
      { detail: error instanceof Error ? error.message : "Unavailable" },
      { status },
    );
  }
}
