import Link from "next/link";
import { Suspense } from "react";

import { listCouncils } from "@/lib/api/agora";
import { requireOrganization } from "@/lib/auth/current";

type Props = PageProps<"/orgs/[organizationId]/councils">;

/** The organization's councils (Agora): teams of its agents. */
export default function CouncilsPage({ params }: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Councils params={params} />
    </Suspense>
  );
}

async function Councils({ params }: Pick<Props, "params">) {
  const { organizationId } = await params;
  const session = await requireOrganization(
    organizationId,
    `/orgs/${organizationId}/councils`,
  );
  const councils = await listCouncils(session.accessToken, organizationId);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            <Link href={`/orgs/${organizationId}/agents`} className="underline">
              Agents
            </Link>
          </p>
          <h1 className="text-2xl font-semibold">Councils</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Teams of agents: a facilitator and members who discuss, plan and
            delegate work together, with people overseeing them. Sessions with a
            council are coming next; for now, define them here.
          </p>
        </div>
        <Link
          href={`/orgs/${organizationId}/councils/new`}
          className="shrink-0 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500"
        >
          New council
        </Link>
      </div>
      {councils.items.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No councils yet.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {councils.items.map((council) => (
            <li key={council.id}>
              <Link
                href={`/orgs/${organizationId}/councils/${council.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <span className="min-w-0">
                  <span className="block font-medium">
                    {council.name}{" "}
                    <span className="font-mono text-xs text-zinc-500">
                      {council.key}
                    </span>
                  </span>
                  {council.description ? (
                    <span className="block truncate text-sm text-zinc-500">
                      {council.description}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-sm text-zinc-500">
                  {council.status === "archived"
                    ? "Archived"
                    : council.latestVersionId
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
