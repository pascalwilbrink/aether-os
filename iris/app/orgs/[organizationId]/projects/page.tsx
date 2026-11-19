import Link from "next/link";
import { Suspense } from "react";

import { listNotifications } from "@/lib/api/kerykes";
import { listProjects } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";
import { showArchived } from "@/lib/projects";
import { projectColor } from "@/lib/sidebar";
import { formatTime } from "@/lib/tasks";

import { createProjectAction } from "./actions";
import { NewProjectDialog } from "./new-project-dialog";

type Props = PageProps<"/orgs/[organizationId]/projects">;

/** The organization's projects the person can read (Polis), and a new one (a dialog). */
export default function ProjectsPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Projects {...props} />
    </Suspense>
  );
}

async function Projects({ params, searchParams }: Props) {
  const { organizationId } = await params;
  const { show, created } = await searchParams;
  const path = `/orgs/${organizationId}/projects`;
  const session = await requireOrganization(organizationId, path);
  const archived = showArchived(show);
  const [projects, unread] = await Promise.all([
    listProjects(session.accessToken, organizationId),
    // Unread notifications per project, for a count on each card; none if Kerykes is down.
    listNotifications(session.accessToken, organizationId, { unread: true, limit: 100 }).catch(() => null),
  ]);
  const unreadByProject = new Map<string, number>();
  for (const notification of unread?.items ?? []) {
    if (notification.projectId) {
      unreadByProject.set(notification.projectId, (unreadByProject.get(notification.projectId) ?? 0) + 1);
    }
  }
  const shown = projects.items.filter((project) => archived || project.status === "active");
  const archivedCount = projects.items.filter((project) => project.status === "archived").length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Where tasks run: each project has its own tasks, automations, repositories, budget and access.
          </p>
        </div>
        <NewProjectDialog action={createProjectAction.bind(null, organizationId)} />
      </div>

      {created === "1" ? (
        <p
          role="status"
          className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
        >
          The project is created. To open it you need a role in it: an owner or admin of the organization can give you
          one on the project&apos;s page.
        </p>
      ) : null}

      {shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
          <p className="font-medium">{archived ? "No projects" : "No active projects you can see"}</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Create one to start running tasks.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((project) => {
            const count = unreadByProject.get(project.id) ?? 0;
            return (
              <li key={project.id}>
                <Link
                  href={`${path}/${project.id}`}
                  className="flex h-full flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/40 dark:hover:border-zinc-700"
                >
                  <span className="flex items-center gap-2">
                    <span className={`size-2 shrink-0 rounded-full ${projectColor(project.id)}`} />
                    <span className="flex-1 truncate font-medium">{project.name}</span>
                    {project.status === "archived" ? (
                      <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                        Archived
                      </span>
                    ) : count > 0 ? (
                      <span
                        className="rounded-md bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                        title="Unread notifications about this project"
                      >
                        {count} unread
                      </span>
                    ) : null}
                  </span>
                  <span className="font-mono text-xs text-zinc-500">{project.slug}</span>
                  {project.description ? (
                    <span className="line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{project.description}</span>
                  ) : null}
                  <span className="mt-auto pt-2 text-xs text-zinc-500">Created {formatTime(project.createdAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {archivedCount > 0 ? (
        <p className="text-sm">
          {archived ? (
            <Link href={path} className="underline">
              Hide archived projects
            </Link>
          ) : (
            <Link href={`${path}?show=all`} className="underline">
              Show {archivedCount} archived {archivedCount === 1 ? "project" : "projects"}
            </Link>
          )}
        </p>
      ) : null}
    </div>
  );
}
