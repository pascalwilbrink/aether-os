import { Suspense } from "react";

import { isAdmin } from "@/lib/admin";
import { myMemberships } from "@/lib/api/polis";
import { requireSession } from "@/lib/auth/current";

import { Notice } from "../components/notice";
import { PublicShell } from "../components/public-shell";
import { SignOutButton } from "../components/sign-out";

/**
 * Choosing an organization to manage: only those the person owns or
 * administers. Each is a sign-in for a token scoped to it.
 */
export default function Organizations({ searchParams }: PageProps<"/orgs">) {
  return (
    <PublicShell>
      <section className="space-y-6">
        <h1 className="text-2xl font-semibold">Your organizations</h1>
        <Suspense fallback={<p>Loading your organizations…</p>}>
          <OrganizationList searchParams={searchParams} />
        </Suspense>
      </section>
    </PublicShell>
  );
}

async function OrganizationList({
  searchParams,
}: Pick<PageProps<"/orgs">, "searchParams">) {
  const session = await requireSession("/orgs");
  const [{ error }, memberships] = await Promise.all([
    searchParams,
    myMemberships(session.accessToken, session.sub),
  ]);
  const managed = memberships.filter((membership) => isAdmin(membership.roles));

  return (
    <>
      <Notice error={typeof error === "string" ? error : undefined} />
      <div className="flex items-center justify-between text-sm text-zinc-600 dark:text-zinc-400">
        <span>Signed in as {session.name}</span>
        <SignOutButton />
      </div>
      {managed.length === 0 ? (
        <p className="text-zinc-600 dark:text-zinc-400">
          You don&apos;t own or administer an organization, so there&apos;s
          nothing to manage here. An owner can make you an admin of theirs.
        </p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {managed.map((membership) => (
            <li key={membership.id}>
              <a
                href={`/auth/sign-in?organization=${membership.organizationId}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <span>
                  <span className="font-medium">
                    {membership.organization.name}
                  </span>{" "}
                  <span className="text-sm text-zinc-500">
                    {membership.organization.slug}
                  </span>
                </span>
                <span className="text-sm text-zinc-500">
                  {membership.roles.join(", ")}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
