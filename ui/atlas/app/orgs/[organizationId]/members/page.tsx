import Link from "next/link";
import { Suspense } from "react";

import { loadAccess } from "@/lib/access";
import { requireAdmin } from "@/lib/auth/current";
import { assignableRoles, withoutAccess } from "@/lib/members";
import { orgPath } from "@/lib/pages";

import { GrantForm } from "../../../components/role-forms";
import { Card, Loading, PageHeader, Section } from "../../../components/ui";
import { grantAccessAction } from "./actions";
import { MemberControls } from "./member-controls";

type Props = PageProps<"/orgs/[organizationId]/members">;

/** Who may use the organization, with which role; giving and taking access. */
export default function Members({ params }: Props) {
  return (
    <>
      <PageHeader
        title="Members"
        description="Who can use the organization, and with which role. Roles in a project are on the project's page."
      />
      <Suspense fallback={<Loading />}>
        <Content params={params} />
      </Suspense>
    </>
  );
}

async function Content({ params }: Pick<Props, "params">) {
  const { organizationId } = await params;
  const session = await requireAdmin(
    organizationId,
    orgPath(organizationId, "/members"),
  );
  const { members, memberships, persons, me } = await loadAccess(
    session,
    organizationId,
  );
  const candidates = withoutAccess(persons, memberships);

  return (
    <div className="space-y-8">
      <Section title="Give access">
        <Card>
          <GrantForm
            action={grantAccessAction.bind(null, organizationId)}
            candidates={candidates.map((person) => ({
              value: person.userId!,
              label: `${person.name} (${person.email})`,
            }))}
            roles={assignableRoles(me.roles)}
            defaultRole="member"
            submitLabel="Give access"
            empty="Everyone who has signed up has access. Add people on the People page; they can be given access once they sign up with their email address."
          />
        </Card>
      </Section>
      <Section title={`People with access (${members.length})`}>
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
          {members.map((member) => (
            <li
              key={member.membershipId}
              className="flex flex-wrap items-center justify-between gap-4 px-4 py-3"
            >
              <div className="min-w-0">
                {member.personId ? (
                  <Link
                    href={orgPath(organizationId, `/people/${member.personId}`)}
                    className="font-medium hover:underline"
                  >
                    {member.name}
                  </Link>
                ) : (
                  <span className="font-medium">{member.name}</span>
                )}
                {member.disabled ? (
                  <span className="text-sm text-zinc-500"> (disabled)</span>
                ) : null}
                <span className="block truncate text-sm text-zinc-500">
                  {member.email}
                </span>
              </div>
              <MemberControls
                organizationId={organizationId}
                member={member}
                me={me}
              />
            </li>
          ))}
        </ul>
        <p className="text-xs text-zinc-500">
          Service accounts, which tasks and automations run as, are managed in
          Iris.
        </p>
      </Section>
    </div>
  );
}
