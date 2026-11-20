import { unstable_rethrow } from "next/navigation";

import type { Artifact } from "@/lib/api";
import { fileText } from "@/lib/api/loculus";
import { currentSession } from "@/lib/auth/current";
import {
  downloadHref,
  PREVIEW_LIMITS,
  previewDocument,
  previewOf,
} from "@/lib/files";

type FileArtifact = Extract<Artifact, { kind: "file" }>;

/**
 * A file artifact's preview: images through the download route (an `<img>`
 * runs nothing, even an SVG), HTML in a sandboxed frame (an opaque origin,
 * scripts only, a policy that loads nothing from outside), text as is.
 * Render inside `<Suspense>`: it reads the file.
 */
export async function FilePreview({ artifact }: { artifact: FileArtifact }) {
  const kind = previewOf(artifact.contentType, artifact.sizeBytes);
  const href = downloadHref(
    artifact.organizationId,
    artifact.projectId,
    artifact.fileId,
  );
  if (kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a signed URL behind a redirect, not a static asset
      <img
        src={href}
        alt={artifact.fileName}
        className="max-h-96 rounded-md border border-zinc-200 dark:border-zinc-800"
      />
    );
  }
  if (!kind) {
    return null;
  }
  const session = await currentSession();
  if (!session) {
    return null;
  }
  let content: string;
  try {
    content = await fileText(
      session.accessToken,
      artifact.organizationId,
      artifact.projectId,
      artifact.fileId,
      PREVIEW_LIMITS[kind],
    );
  } catch (error) {
    unstable_rethrow(error);
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No preview: the file can&apos;t be read right now.
      </p>
    );
  }
  if (kind === "html") {
    return (
      <iframe
        title={`Preview of ${artifact.fileName}`}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={previewDocument(content)}
        className="h-96 w-full rounded-md border border-zinc-200 bg-white dark:border-zinc-800"
      />
    );
  }
  return (
    <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-100 p-3 font-mono text-xs dark:bg-zinc-900">
      {content}
    </pre>
  );
}
