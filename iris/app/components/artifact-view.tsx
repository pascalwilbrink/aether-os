import type { Artifact } from "@/lib/api";

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
        <p className="text-sm text-zinc-600 dark:text-zinc-400">No acceptance criteria: nothing was checked.</p>
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
                {result.outcome === "passed" ? "✓" : result.outcome === "failed" ? "✗" : "?"} {result.key}
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
    default:
      return null;
  }
}
