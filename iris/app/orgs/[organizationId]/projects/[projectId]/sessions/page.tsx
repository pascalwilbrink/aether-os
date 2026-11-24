import Link from "next/link";
import { Suspense } from "react";

import { listAgents, listCouncils } from "@/lib/api/agora";
import { listSessions } from "@/lib/api/hephaestus";
import { getProject } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";
import { sessionStatus } from "@/lib/sessions";
import { formatTime } from "@/lib/tasks";

import { NewSessionForm } from "./new-session-form";

type Props = PageProps<"/orgs/[organizationId]/projects/[projectId]/sessions">;

/** The person's sessions in a project (docs/interaction.md), and starting one. */
export default function SessionsPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Sessions {...props} />
    </Suspense>
  );
}

async function Sessions({ params }: Props) {
  const { organizationId, projectId } = await params;
  const projectPath = `/orgs/${organizationId}/projects/${projectId}`;
  const path = `${projectPath}/sessions`;
  const session = await requireOrganization(organizationId, path);
  const token = session.accessToken;
  const [project, sessions, agents, councils] = await Promise.all([
    getProject(token, organizationId, projectId),
    listSessions(token, organizationId, projectId),
    listAgents(token, organizationId),
    listCouncils(token, organizationId).catch(() => ({ items: [] })),
  ]);
  const names = new Map([
    ...agents.items.map((agent) => [agent.id, agent.name] as const),
    ...councils.items.map((council) => [council.id, council.name] as const),
  ]);
  const ready = <T extends { status: string; latestVersionId: string | null }>(
    items: T[],
  ) => items.filter((item) => item.status === "active" && item.latestVersionId);

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={projectPath} className="underline">
            {project.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">Sessions</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Talk to an agent, or to a council of agents, about this project. They
          can read what you can, and change nothing themselves. Only you see
          your sessions.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">Your sessions</h2>
        {sessions.items.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            None yet.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {sessions.items.map((item) => {
              const status = sessionStatus(item);
              const subject = item.councilId
                ? names.get(item.councilId) ?? "A council"
                : names.get(item.agentId) ?? "An agent";
              return (
                <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2">
                  <Link href={`${path}/${item.id}`} className="font-medium underline">
                    {item.title ?? `With ${subject}`}
                  </Link>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    {item.councilId ? "Council: " : ""}
                    {subject} · {formatTime(item.lastActivityAt)}
                    <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${status.classes}`}>
                      {status.label}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">New session</h2>
        <NewSessionForm
          project={{ organizationId, projectId }}
          agents={ready(agents.items).map(({ id, name }) => ({ id, name }))}
          councils={ready(councils.items).map(({ id, name }) => ({ id, name }))}
        />
      </section>
    </div>
  );
}
