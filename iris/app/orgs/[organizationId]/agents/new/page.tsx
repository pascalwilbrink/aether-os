import Link from "next/link";
import { Suspense } from "react";

import { getOrganization } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";

import { NewAgentForm } from "../agent-forms";

type Props = PageProps<"/orgs/[organizationId]/agents/new">;

/** A new agent; its instructions and model are its first version, on the next page. */
export default function NewAgentPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <NewAgent {...props} />
    </Suspense>
  );
}

async function NewAgent({ params }: Props) {
  const { organizationId } = await params;
  const session = await requireOrganization(organizationId, `/orgs/${organizationId}/agents/new`);
  const organization = await getOrganization(session.accessToken, organizationId);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={`/orgs/${organizationId}`} className="underline">
            {organization.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">New agent</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Name it here; its instructions and model are its first version, next.
        </p>
      </div>
      <NewAgentForm organizationId={organizationId} />
    </div>
  );
}
