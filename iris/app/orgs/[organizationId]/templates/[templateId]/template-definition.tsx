import type { TaskTemplateVersion } from "@/lib/api";

/** A template's inputs, acceptance criteria and review setting, as a task from it gets them. */
export function TemplateDefinition({
  effective,
}: {
  effective: TaskTemplateVersion["effective"];
}) {
  return (
    <div className="space-y-3 text-sm">
      {effective.inputs.length > 0 ? (
        <div>
          <h3 className="font-medium">Inputs</h3>
          <ul className="mt-1 space-y-1">
            {effective.inputs.map((input) => (
              <li key={input.name}>
                <span className="font-mono text-xs">{`{{${input.name}}}`}</span>{" "}
                {input.description}
                {input.required === false ? (
                  <span className="text-xs text-zinc-500"> (optional)</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {effective.acceptanceCriteria.length > 0 ? (
        <div>
          <h3 className="font-medium">Acceptance criteria</h3>
          <ul className="mt-1 list-inside list-disc">
            {effective.acceptanceCriteria.map((criterion) => (
              <li key={criterion.key}>
                <span className="font-mono text-xs">{criterion.key}</span>{" "}
                {criterion.description}{" "}
                <span className="text-xs text-zinc-500">
                  (
                  {criterion.check.type === "command"
                    ? `runs ${criterion.check.command}`
                    : criterion.check.type}
                  )
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {effective.review.artifactKinds.length > 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          Needs approval:{" "}
          {effective.review.artifactKinds.includes("*")
            ? "everything its tasks produce"
            : effective.review.artifactKinds.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
