import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { listAgents } from "@/lib/api/hephaestus";
import { getOrganization, listProjects } from "@/lib/api/polis";
import { requireSession } from "@/lib/auth/current";

import { SignOutButton } from "../../components/sign-out";

/** An organization, with a token for it: its projects (from Polis) and agents (from Hephaestus). */
export default function OrganizationHome({ params }: PageProps<"/orgs/[organizationId]">) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Overview params={params} />
    </Suspense>
  );
}

async function Overview({ params }: Pick<PageProps<"/orgs/[organizationId]">, "params">) {
  const { organizationId } = await params;
  const session = await requireSession(`/orgs/${organizationId}`);
  if (session.organizationId !== organizationId) {
    // A token for another organization (or none): switch, through Pistis.
    redirect(`/auth/sign-in?organization=${encodeURIComponent(organizationId)}`);
  }

  const [organization, projects, agents] = await Promise.all([
    getOrganization(session.accessToken, organizationId),
    listProjects(session.accessToken, organizationId),
    listAgents(session.accessToken, organizationId),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{organization.name}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as {session.name} ·{" "}
            <Link href={`/orgs/${organizationId}/members`} className="underline">
              Members
            </Link>{" "}
            ·{" "}
            <Link href={`/orgs/${organizationId}/github`} className="underline">
              GitHub
            </Link>{" "}
            ·{" "}
            <Link href={`/orgs/${organizationId}/budget`} className="underline">
              Budget
            </Link>{" "}
            ·{" "}
            <Link href="/orgs" className="underline">
              Switch organization
            </Link>
          </p>
        </div>
        <SignOutButton />
      </div>

      <section>
        <h2 className="mb-2 font-medium">Projects</h2>
        {projects.items.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No projects you can see yet.</p>
        ) : (
          <ul className="list-inside list-disc text-sm">
            {projects.items.map((project) => (
              <li key={project.id}>
                <Link href={`/orgs/${organizationId}/projects/${project.id}`} className="underline">
                  {project.name}
                </Link>{" "}
                <span className="text-zinc-500">({project.slug})</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="font-medium">Agents</h2>
          <Link href={`/orgs/${organizationId}/agents/new`} className="text-sm underline">
            New agent
          </Link>
        </div>
        {agents.items.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">No agents yet.</p>
        ) : (
          <ul className="list-inside list-disc text-sm">
            {agents.items.map((agent) => (
              <li key={agent.id}>
                <Link href={`/orgs/${organizationId}/agents/${agent.id}`} className="underline">
                  {agent.name}
                </Link>{" "}
                <span className="text-zinc-500">
                  (
                  {agent.status === "archived"
                    ? "archived"
                    : agent.latestVersionId
                      ? "published"
                      : "no published version"}
                  )
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
