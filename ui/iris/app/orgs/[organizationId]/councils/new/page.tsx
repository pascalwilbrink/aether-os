import Link from "next/link";
import { Suspense } from "react";

import { requireOrganization } from "@/lib/auth/current";

import { NewCouncilForm } from "../council-forms";

type Props = PageProps<"/orgs/[organizationId]/councils/new">;

/** A new council; its facilitator and members are its first version, on the next page. */
export default function NewCouncilPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <NewCouncil {...props} />
    </Suspense>
  );
}

async function NewCouncil({ params }: Props) {
  const { organizationId } = await params;
  await requireOrganization(
    organizationId,
    `/orgs/${organizationId}/councils/new`,
  );
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={`/orgs/${organizationId}/councils`} className="underline">
            Councils
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">New council</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Name it here; its facilitator and members are its first version, next.
        </p>
      </div>
      <NewCouncilForm organizationId={organizationId} />
    </div>
  );
}
