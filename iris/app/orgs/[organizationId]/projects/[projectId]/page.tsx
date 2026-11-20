import Link from "next/link";
import { Suspense } from "react";

import { BudgetForm, BudgetMeter } from "@/app/components/budget";
import { StatusBadge } from "@/app/components/status-badge";
import {
  getProjectBudget,
  listAgents,
  listTasks,
  listTaskTemplates,
} from "@/lib/api/hephaestus";
import { ApiError } from "@/lib/api/http";
import { listOrganizationUsers, listServiceAccounts } from "@/lib/api/pistis";
import {
  getOrganization,
  getProject,
  listMemberships,
  listProjectMemberships,
} from "@/lib/api/polis";
import { listAutomations } from "@/lib/api/kairos";
import {
  listRepositories,
  listRepositoryLinks,
  orUnavailable,
} from "@/lib/api/proxenos";
import { requireOrganization } from "@/lib/auth/current";
import { automationStatus, triggerSummary } from "@/lib/automations";
import { linkableRepositories, repositoryChoices } from "@/lib/github";
import {
  people,
  PROJECT_ROLES,
  projectAccess,
  roleLabel,
  runnableServiceAccounts,
  serviceAccountMembers,
  serviceAccountRows,
  withoutProjectRole,
} from "@/lib/members";
import {
  formatTime,
  isTaskStatus,
  statusLabel,
  TASK_STATUSES,
} from "@/lib/tasks";

import { ActionButton, RoleForm } from "@/app/components/action-forms";

import { GrantAccessForm } from "./access-form";
import {
  changeProjectRoleAction,
  removeProjectRoleAction,
  setProjectBudgetAction,
  unlinkRepositoryAction,
} from "./actions";
import { LinkRepositoryForm } from "./link-repository-form";
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

  // Reading members needs `member:read` (every organization role has it); without it, less to show.
  const orEmpty = <T,>(
    promise: Promise<{ items: T[]; nextCursor: string | null }>,
  ) =>
    promise.catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 403)
        return { items: [] as T[], nextCursor: null };
      throw error;
    });
  const [
    organization,
    project,
    tasks,
    agents,
    templates,
    serviceAccounts,
    grants,
    userMemberships,
    accountMemberships,
    users,
    links,
    repositories,
    budget,
    automations,
  ] = await Promise.all([
    getOrganization(token, organizationId),
    getProject(token, organizationId, projectId),
    listTasks(token, organizationId, projectId, { status }),
    listAgents(token, organizationId),
    listTaskTemplates(token, organizationId, projectId),
    orEmpty(listServiceAccounts(token, organizationId)),
    listProjectMemberships(token, organizationId, projectId),
    orEmpty(listMemberships(token, organizationId, "user")),
    orEmpty(listMemberships(token, organizationId, "service_account")),
    orEmpty(listOrganizationUsers(token, organizationId)),
    orUnavailable(listRepositoryLinks(token, organizationId, projectId)),
    orUnavailable(listRepositories(token, organizationId)),
    getProjectBudget(token, organizationId, projectId),
    orUnavailable(listAutomations(token, organizationId, projectId)),
  ]);
  const runnable = agents.items.filter(
    (agent) => agent.status === "active" && agent.latestVersionId,
  );
  // Only service accounts with a role here can run its tasks.
  const accounts = runnableServiceAccounts(serviceAccounts.items, grants.items);
  const members = [
    ...people(userMemberships.items, users.items),
    ...serviceAccountMembers(
      serviceAccountRows(serviceAccounts.items, accountMemberships.items),
    ),
  ];
  const access = projectAccess(grants.items, members);
  const candidates = withoutProjectRole(members, grants.items).map(
    (member) => ({
      value: `${member.subjectType}:${member.subject}`,
      label: `${member.name}${member.subjectType === "service_account" ? " (service account)" : ""}`,
    }),
  );
  const accessRef = (membershipId: string) => ({
    organizationId,
    projectId,
    membershipId,
  });
  const linkable = linkableRepositories(repositories.items, links.items);

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
          <nav
            className="flex flex-wrap gap-2 text-xs"
            aria-label="Filter by status"
          >
            <FilterLink href={path} active={!status}>
              All
            </FilterLink>
            {TASK_STATUSES.map((value) => (
              <FilterLink
                key={value}
                href={`${path}?status=${value}`}
                active={status === value}
              >
                {statusLabel(value)}
              </FilterLink>
            ))}
          </nav>
        </div>
        {tasks.items.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {status
              ? `No ${statusLabel(status).toLowerCase()} tasks.`
              : "No tasks yet."}
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
                    <Link
                      href={`${path}/tasks/${task.id}`}
                      className="font-medium hover:underline"
                    >
                      {task.title}
                    </Link>
                    {task.parentTaskId ? (
                      <span className="ml-2 text-xs text-zinc-500">
                        subtask
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-2">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">
                    {formatTime(task.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">From a template</h2>
        {templates.items.filter((t) => t.status === "active").length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No templates for this project yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {templates.items
              .filter((template) => template.status === "active")
              .map((template) => (
                <li
                  key={template.id}
                  className="flex items-baseline justify-between py-2"
                >
                  <div>
                    <Link
                      href={`${path}/templates/${template.id}`}
                      className="font-medium hover:underline"
                    >
                      {template.name}
                    </Link>
                    <span className="ml-2 text-xs text-zinc-500">
                      {template.projectId ? "this project" : "organization"} · v
                      {template.latestVersion}
                    </span>
                    {template.description ? (
                      <p className="text-zinc-600 dark:text-zinc-400">
                        {template.description}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section id="automations" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="font-medium">Automations</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Tasks that start themselves when something happens on GitHub, in
              this project&apos;s repositories.
            </p>
          </div>
          <Link href={`${path}/automations/new`} className="text-sm underline">
            New automation
          </Link>
        </div>
        {automations.unavailable ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Automations can&apos;t be shown right now (Kairos isn&apos;t
            answering).
          </p>
        ) : automations.items.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No automations yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
            {automations.items.map((automation) => {
              const status = automationStatus(automation.status);
              const repository =
                links.items.find(
                  (link) => link.id === automation.trigger.repositoryLinkId,
                )?.repository.fullName ?? null;
              return (
                <li key={automation.id} className="py-2">
                  <Link
                    href={`${path}/automations/${automation.id}`}
                    className="font-medium hover:underline"
                  >
                    {automation.name}
                  </Link>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${status.classes}`}
                  >
                    {status.label}
                  </span>
                  <p className="text-zinc-600 dark:text-zinc-400">
                    {triggerSummary(automation.trigger, repository)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section id="budget" className="space-y-3">
        <div>
          <h2 className="font-medium">Budget</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            What this project&apos;s model calls cost this month; at its limit,
            its tasks pause until it&apos;s raised or the next month starts. The
            organization has{" "}
            <Link href={`/orgs/${organizationId}/budget`} className="underline">
              a budget
            </Link>{" "}
            too.
          </p>
        </div>
        <BudgetMeter budget={budget} />
        <BudgetForm
          budget={budget}
          action={setProjectBudgetAction.bind(null, {
            organizationId,
            projectId,
          })}
        />
      </section>

      <section id="access" className="space-y-3">
        <div>
          <h2 className="font-medium">Access</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Roles in this project. The organization&apos;s owners and admins are
            admins here already; a task runs as a service account with a role
            here.{" "}
            <Link
              href={`/orgs/${organizationId}/members`}
              className="underline"
            >
              Members
            </Link>
          </p>
        </div>
        {access.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Nobody has a role here yet.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {access.map(({ membership, member }) => (
                <tr key={membership.id} className="align-top">
                  <td className="py-2 pr-2">
                    {member?.name ?? `${membership.subject.slice(0, 8)}…`}
                    {membership.subjectType === "service_account" ? (
                      <span className="ml-2 text-xs text-zinc-500">
                        service account
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-2">
                    <RoleForm
                      action={changeProjectRoleAction.bind(
                        null,
                        accessRef(membership.id),
                      )}
                      roles={PROJECT_ROLES}
                      current={membership.role}
                    />
                  </td>
                  <td className="py-2 text-right">
                    <ActionButton
                      action={removeProjectRoleAction.bind(
                        null,
                        accessRef(membership.id),
                      )}
                      label="Remove"
                      pendingLabel="Removing…"
                      confirmText={`Remove ${member?.name ?? "their"} role (${roleLabel(membership.role)}) in ${project.name}?`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <GrantAccessForm
          project={{ organizationId, projectId }}
          candidates={candidates}
        />
      </section>

      <section id="repositories" className="space-y-3">
        <div>
          <h2 className="font-medium">Repositories</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Repositories this project&apos;s tasks can work in: the agent
            commits in a copy, and its work arrives as a pull request. They come
            from the organization&apos;s{" "}
            <Link href={`/orgs/${organizationId}/github`} className="underline">
              GitHub
            </Link>{" "}
            connection.
          </p>
        </div>
        {links.unavailable ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Repositories can&apos;t be shown right now (Proxenos isn&apos;t
            answering, or no GitHub App is set up yet).
          </p>
        ) : (
          <>
            {links.items.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No repositories linked yet.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-200 text-sm dark:divide-zinc-800">
                {links.items.map((link) => (
                  <li
                    key={link.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                  >
                    <div>
                      <span className="font-medium">
                        {link.repository.fullName}
                      </span>{" "}
                      <span className="text-xs text-zinc-500">
                        pull requests into{" "}
                        <span className="font-mono">
                          {link.repository.defaultBranch}
                        </span>
                      </span>
                    </div>
                    <ActionButton
                      action={unlinkRepositoryAction.bind(null, {
                        organizationId,
                        projectId,
                        linkId: link.id,
                      })}
                      label="Unlink"
                      pendingLabel="Unlinking…"
                      confirmText={`Unlink ${link.repository.fullName} from ${project.name}? New tasks can't use it; tasks already running keep their copy.`}
                    />
                  </li>
                ))}
              </ul>
            )}
            <LinkRepositoryForm
              project={{ organizationId, projectId }}
              repositories={linkable.map(({ id, fullName }) => ({
                id,
                name: fullName,
              }))}
              connectHref={`/orgs/${organizationId}/github`}
              unavailable={repositories.unavailable}
            />
          </>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-medium">New task</h2>
        <NewTaskForm
          project={{ organizationId, projectId }}
          agents={runnable.map(({ id, name }) => ({ id, name }))}
          serviceAccounts={accounts.map(({ id, name }) => ({ id, name }))}
          repositories={repositoryChoices(links.items)}
          idempotencyKey={crypto.randomUUID()}
        />
      </section>
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-full px-2 py-0.5 ${
        active
          ? "bg-indigo-600 text-white"
          : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300"
      }`}
    >
      {children}
    </Link>
  );
}
