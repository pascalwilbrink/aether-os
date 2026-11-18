import type { TaskStatus } from "@/lib/api";
import { statusClasses, statusLabel } from "@/lib/tasks";

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusClasses(status)}`}>
      {statusLabel(status)}
    </span>
  );
}
