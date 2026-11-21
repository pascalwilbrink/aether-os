import type { TaskDeliverable, TaskItem } from "@/lib/task-brief";
import { deliverableKindLabel } from "@/lib/task-brief";

/**
 * A task's brief, or what a template gives a task (docs/tasks.md, Task
 * fields): its description, expected outcome, requirements, constraints and
 * deliverables, each section left out when empty.
 */
export function TaskBrief({
  description,
  expectedOutcome,
  requirements,
  constraints,
  deliverables,
}: {
  description: string;
  expectedOutcome: string | null;
  requirements: TaskItem[];
  constraints: TaskItem[];
  deliverables: TaskDeliverable[];
}) {
  return (
    <div className="space-y-3 text-sm">
      <pre className="whitespace-pre-wrap rounded-md bg-zinc-100 p-3 dark:bg-zinc-900">
        {description}
      </pre>
      {expectedOutcome ? (
        <div>
          <h3 className="font-medium">Expected outcome</h3>
          <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
            {expectedOutcome}
          </p>
        </div>
      ) : null}
      <ItemList title="Requirements" items={requirements} />
      <ItemList title="Constraints" items={constraints} />
      {deliverables.length > 0 ? (
        <div>
          <h3 className="font-medium">Deliverables</h3>
          <ul className="mt-1 space-y-1">
            {deliverables.map((deliverable) => (
              <li key={deliverable.key} className="flex flex-wrap gap-x-2">
                <span className="font-mono text-xs">{deliverable.key}</span>
                <span className="rounded-full bg-zinc-100 px-2 text-xs dark:bg-zinc-800">
                  {deliverableKindLabel(deliverable.kind)}
                  {deliverable.path ? ` · ${deliverable.path}` : ""}
                </span>
                {deliverable.primary ? (
                  <span className="rounded-full bg-emerald-100 px-2 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    main outcome
                  </span>
                ) : null}
                <span>{deliverable.description}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ItemList({ title, items }: { title: string; items: TaskItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="font-medium">{title}</h3>
      <ul className="mt-1 space-y-1">
        {items.map((item) => (
          <li key={item.key}>
            <span className="font-mono text-xs">{item.key}</span>{" "}
            {item.description}
          </li>
        ))}
      </ul>
    </div>
  );
}
