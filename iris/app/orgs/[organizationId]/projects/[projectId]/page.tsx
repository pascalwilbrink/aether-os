import Link from "next/link";
import { Suspense } from "react";

import { StatusBadge } from "@/app/components/status-badge";
import { listAgents, listTasks, listTaskTemplates } from "@/lib/api/hephaestus";
import { ApiError } from "@/lib/api/http";
import { listServiceAccounts } from "@/lib/api/pistis";
import { getOrganization, getProject } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";
import { formatTime, isTaskStatus, statusLabel, TASK_STATUSES } from "@/lib/tasks";

import { NewTaskForm } from "./new-task-form";

type Props = PageProps<"/orgs/[organizationId]/projects/[projectId]">;

/** A project: its tasks, starting new ones, and the templates it can use. */
export default function ProjectPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Project {...props} />
    </Suspense>
  );
}

async function Project({ params, searchParams }: Props) {
  const { organizationId, projectId } = await params;
  const { status: statusParam } = await searchParams;
  const status = isTaskStatus(statusParam) ? statusParam : undefined;
  const path = `/orgs/${organizationId}/projects/${projectId}`;
  const session = await requireOrganization(organizationId, path);
  const token = session.accessToken;

  const [organization, project, tasks, agents, templates, serviceAccounts] = await Promise.all([
    getOrganization(token, organizationId),
    getProject(token, organizationId, projectId),
    listTasks(token, organizationId, projectId, { status }),
    listAgents(token, organizationId),
    listTaskTemplates(token, organizationId, projectId),
    // Reading service accounts needs `member:read`; without it, no form.
    listServiceAccounts(token, organizationId).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 403) return { items: [], nextCursor: null };
      throw error;
    }),
  ]);
  const runnable = agents.items.filter((agent) => agent.status === "active" && agent.latestVersionId);
  const accounts = serviceAccounts.items.filter((account) => account.status === "active");

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={`/orgs/${organizationId}`} className="underline">
            {organization.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">{project.name}</h1>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Tasks</h2>
          <nav className="flex flex-wrap gap-2 text-xs" aria-label="Filter by status">
            <FilterLink href={path} active={!status}>
              All
            </FilterLink>
            {TASK_STATUSES.map((value) => (
              <FilterLink key={value} href={`${path}?status=${value}`} active={status === value}>
                {statusLabel(value)}
              </FilterLink>
            ))}
          </nav>
        </div>
        {tasks.items.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {status ? `No ${statusLabel(status).toLowerCase()} tasks.` : "No tasks yet."}
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-1 font-normal">Title</th>
                <th className="py-1 font-normal">Status</th>
                <th className="py-1 font-normal">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {tasks.items.map((task) => (
                <tr key={task.id}>
                  <td className="py-2 pr-2">
                    <Link href={`${path}/tasks/${task.id}`} className="font-medium hover:underline">
                      {task.title}
                    </Link>
                    {task.parentTaskId ? <span className="ml-2 text-xs text-zinc-500">subtask</span> : null}
                  </td>
                  <td className="py-2 pr-2">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">{formatTime(task.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">From a template</h2>
        {templates.items.filter((t) => t.status === "active").length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No templates for this project yet.</p>
        ) : (
          <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {templates.items
              .filter((template) => template.status === "active")
              .map((template) => (
                <li key={template.id} className="flex items-baseline justify-between py-2">
                  <div>
                    <Link href={`${path}/templates/${template.id}`} className="font-medium hover:underline">
                      {template.name}
                    </Link>
                    <span className="ml-2 text-xs text-zinc-500">
                      {template.projectId ? "this project" : "organization"} · v{template.latestVersion}
                    </span>
                    {template.description ? (
                      <p className="text-zinc-600 dark:text-zinc-400">{template.description}</p>
                    ) : null}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium">New task</h2>
        <NewTaskForm
          project={{ organizationId, projectId }}
          agents={runnable.map(({ id, name }) => ({ id, name }))}
          serviceAccounts={accounts.map(({ id, name }) => ({ id, name }))}
          idempotencyKey={crypto.randomUUID()}
        />
      </section>
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-2 py-0.5 ${
        active ? "bg-indigo-600 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
      }`}
    >
      {children}
    </Link>
  );
}
