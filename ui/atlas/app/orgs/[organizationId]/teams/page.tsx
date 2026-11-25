import { Suspense } from "react";

import { listDepartments, listTeams } from "@/lib/api/polis";
import { requireAdmin } from "@/lib/auth/current";
import { orgPath } from "@/lib/pages";

import {
  ArchivedBadge,
  Card,
  LinkList,
  Loading,
  PageHeader,
  Section,
} from "../../../components/ui";
import { createTeamAction } from "./actions";
import { TeamForm } from "./team-form";

type Props = PageProps<"/orgs/[organizationId]/teams">;

/** The organization's teams, and a new one. */
export default function Teams({ params }: Props) {
  return (
    <>
      <PageHeader
        title="Teams"
        description="People working together, in any of the organization's departments. Someone can be in many teams."
      />
      <Suspense fallback={<Loading />}>
        <Content params={params} />
      </Suspense>
    </>
  );
}

async function Content({ params }: Pick<Props, "params">) {
  const { organizationId } = await params;
  const { accessToken } = await requireAdmin(
    organizationId,
    orgPath(organizationId, "/teams"),
  );
  const [teams, departments] = await Promise.all([
    listTeams(accessToken, organizationId),
    listDepartments(accessToken, organizationId),
  ]);
  const departmentName = new Map(departments.map((d) => [d.id, d.name]));

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[2fr_1fr]">
      <LinkList
        empty="No teams yet."
        items={teams.map((team) => ({
          id: team.id,
          href: orgPath(organizationId, `/teams/${team.id}`),
          label: team.name,
          detail: (
            <span className="inline-flex items-center gap-2">
              {team.departmentIds
                .map((id) => departmentName.get(id))
                .filter(Boolean)
                .join(", ")}
              <ArchivedBadge status={team.status} />
            </span>
          ),
        }))}
      />
      <Section title="New team">
        <Card>
          <TeamForm
            action={createTeamAction.bind(null, organizationId)}
            departments={departments}
            submitLabel="Create team"
          />
        </Card>
      </Section>
    </div>
  );
}
