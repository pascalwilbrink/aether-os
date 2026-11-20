import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api/http";
import { fileDownload } from "@/lib/api/loculus";
import { currentSession } from "@/lib/auth/current";
import { downloadHref } from "@/lib/files";

/**
 * Downloads a project's file (a file artifact): asks Loculus for a fresh
 * signed URL with the person's own token (`file:read` in the project) and
 * sends the browser there. The file comes as an attachment, never shown
 * from the storage's origin.
 */
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{
      organizationId: string;
      projectId: string;
      fileId: string;
    }>;
  },
) {
  const { organizationId, projectId, fileId } = await params;
  const here = downloadHref(organizationId, projectId, fileId);
  const session = await currentSession();
  if (!session || session.organizationId !== organizationId) {
    redirect(
      `/auth/sign-in?organization=${encodeURIComponent(organizationId)}&returnTo=${encodeURIComponent(here)}`,
    );
  }
  try {
    const { url } = await fileDownload(
      session.accessToken,
      organizationId,
      projectId,
      fileId,
    );
    return Response.redirect(url, 302);
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) {
      return new Response(
        error.status === 409
          ? "This file isn't uploaded yet."
          : "This file can't be found.",
        {
          status: error.status === 409 ? 409 : 404,
          headers: { "content-type": "text/plain; charset=utf-8" },
        },
      );
    }
    return new Response(
      "Files can't be reached right now. Try again in a moment.",
      {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      },
    );
  }
}
