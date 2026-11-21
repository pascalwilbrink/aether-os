import { MAX_TASK_CONTEXT } from "@/lib/tasks";

export interface KnowledgeOption {
  id: string;
  title: string;
  type: string;
}

/**
 * The project's accepted knowledge to pin (`context`, as checkboxes named
 * `context`): its text at the version of the day a task is created goes
 * into the agent's prompt, for every run. Nothing when there's none to
 * offer (or Seshat didn't answer).
 */
export function KnowledgePicker({
  knowledge,
  checked,
  hint = "Pinned at today's version: written items go into the agent's prompt, documents are listed for it to read.",
}: {
  knowledge: KnowledgeOption[];
  checked: string[];
  hint?: string;
}) {
  if (knowledge.length === 0) {
    return null;
  }
  return (
    <fieldset className="text-sm">
      <legend>
        Knowledge <span className="text-zinc-500">(optional)</span>
      </legend>
      <div className="mt-1 max-h-48 space-y-1 overflow-y-auto rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
        {knowledge.map((item) => (
          <label key={item.id} className="flex items-baseline gap-2">
            <input
              type="checkbox"
              name="context"
              value={item.id}
              defaultChecked={checked.includes(item.id)}
            />
            <span>
              {item.title}{" "}
              <span className="text-xs text-zinc-500">{item.type}</span>
            </span>
          </label>
        ))}
      </div>
      <span className="mt-1 block text-xs text-zinc-500">
        {hint} At most {MAX_TASK_CONTEXT}.
      </span>
    </fieldset>
  );
}
