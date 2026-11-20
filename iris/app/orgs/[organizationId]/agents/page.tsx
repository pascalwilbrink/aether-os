import Link from "next/link";
import { Suspense } from "react";

import { listAgents } from "@/lib/api/hephaestus";
import { requireOrganization } from "@/lib/auth/current";

type Props = PageProps<"/orgs/[organizationId]/agents">;

/** The organization's agents (Hephaestus), each with whether new tasks can run it. */
export default function AgentsPage({ params }: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Agents params={params} />
    </Suspense>
  );
}

async function Agents({ params }: Pick<Props, "params">) {
  const { organizationId } = await params;
  const session = await requireOrganization(
    organizationId,
    `/orgs/${organizationId}/agents`,
  );
  const agents = await listAgents(session.accessToken, organizationId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Agents</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            What runs tasks: instructions, a model and a runtime, in versions.
            Tasks run the published version.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={`/orgs/${organizationId}/skills`}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Skills
          </Link>
          <Link
            href={`/orgs/${organizationId}/agents/new`}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
          >
            New agent
          </Link>
        </div>
      </div>
      {agents.items.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No agents yet.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {agents.items.map((agent) => (
            <li key={agent.id}>
              <Link
                href={`/orgs/${organizationId}/agents/${agent.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{agent.name}</span>
                  {agent.description ? (
                    <span className="block truncate text-sm text-zinc-500">
                      {agent.description}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-sm text-zinc-500">
                  {agent.status === "archived"
                    ? "Archived"
                    : agent.latestVersionId
                      ? "Published"
                      : "No published version"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
