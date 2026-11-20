import { Suspense } from "react";

import type { Artifact } from "@/lib/api";
import { downloadHref, formatBytes, previewOf } from "@/lib/files";

import { FilePreview } from "./file-preview";

/** An artifact's content, by kind (unknown kinds show their common fields only). */
export function ArtifactContent({ artifact }: { artifact: Artifact }) {
  switch (artifact.kind) {
    case "text":
      return (
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-100 p-3 text-sm dark:bg-zinc-900">
          {artifact.content}
        </pre>
      );
    case "json":
      return (
        <pre className="max-h-96 overflow-auto rounded-md bg-zinc-100 p-3 font-mono text-xs dark:bg-zinc-900">
          {JSON.stringify(artifact.content, null, 2)}
        </pre>
      );
    case "verification":
      return artifact.results.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No acceptance criteria: nothing was checked.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {artifact.results.map((result) => (
            <li key={result.key}>
              <span
                className={
                  result.outcome === "passed"
                    ? "text-emerald-700 dark:text-emerald-300"
                    : result.outcome === "failed"
                      ? "text-red-700 dark:text-red-300"
                      : "text-amber-700 dark:text-amber-300"
                }
              >
                {result.outcome === "passed"
                  ? "✓"
                  : result.outcome === "failed"
                    ? "✗"
                    : "?"}{" "}
                {result.key}
              </span>
              {result.output ? (
                <pre className="mt-1 max-h-40 overflow-auto rounded bg-zinc-100 p-2 font-mono text-xs dark:bg-zinc-900">
                  {result.output}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      );
    case "pull_request":
      return (
        <div className="space-y-2 text-sm">
          <p>
            <span className="font-mono">{artifact.branch}</span> →{" "}
            <span className="font-mono">{artifact.baseBranch}</span> in{" "}
            {artifact.repository}, at{" "}
            <span className="font-mono">{artifact.headSha.slice(0, 12)}</span>
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            {artifact.pullRequest ? (
              <a href={artifact.pullRequest.url} className="underline">
                Pull request #{artifact.pullRequest.number} (
                {artifact.pullRequest.state})
              </a>
            ) : (
              "Pushed; the pull request opens when the task delivers."
            )}
          </p>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-md bg-zinc-100 p-3 text-sm dark:bg-zinc-900">
            {artifact.description}
          </pre>
        </div>
      );
    case "file":
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-mono">{artifact.fileName}</span>
            <span className="text-zinc-600 dark:text-zinc-400">
              {artifact.contentType} · {formatBytes(artifact.sizeBytes)}
            </span>
            <a
              href={downloadHref(
                artifact.organizationId,
                artifact.projectId,
                artifact.fileId,
              )}
              className="rounded-md border border-zinc-300 px-2 py-1 font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Download
            </a>
          </div>
          {previewOf(artifact.contentType, artifact.sizeBytes) ? (
            <Suspense
              fallback={
                <div className="h-24 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-900" />
              }
            >
              <FilePreview artifact={artifact} />
            </Suspense>
          ) : null}
        </div>
      );
    default:
      return null;
  }
}
