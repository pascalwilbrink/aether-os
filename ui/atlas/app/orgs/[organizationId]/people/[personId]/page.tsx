import { Suspense } from "react";

import { getPerson, listDepartments, listTeams } from "@/lib/api/polis";
import { requireAdmin } from "@/lib/auth/current";
import { orgPath, orNotFound } from "@/lib/pages";

import { ActionButton } from "../../../../components/action-button";
import {
  ArchivedBadge,
  Card,
  LinkList,
  Loading,
  PageHeader,
  Section,
} from "../../../../components/ui";
import { deletePersonAction, updatePersonAction } from "../actions";
import { PersonForm } from "../person-form";

type Props = PageProps<"/orgs/[organizationId]/people/[personId]">;

/** Someone: their details and departments, their teams, deleting them. */
export default function PersonPage({ params }: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<Props, "params">) {
  const { organizationId, personId } = await params;
  const { accessToken } = await requireAdmin(
    organizationId,
    orgPath(organizationId, `/people/${personId}`),
  );
  const person = await orNotFound(
    getPerson(accessToken, organizationId, personId),
  );
  const [departments, teams] = await Promise.all([
    listDepartments(accessToken, organizationId),
    listTeams(accessToken, organizationId, { personId }),
  ]);

  return (
    <>
      <PageHeader
        title={person.name}
        description={
          <>
            {person.email} ·{" "}
            {person.userId ? "signed up" : "hasn't signed up yet"}
          </>
        }
        back={{ href: orgPath(organizationId, "/people"), label: "People" }}
      >
        <ActionButton
          action={deletePersonAction.bind(null, organizationId, personId)}
          label="Delete"
          pendingLabel="Deleting…"
          confirm={`Delete ${person.name}? They leave every department and team. Their user and memberships stay.`}
          danger
        />
      </PageHeader>
      <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
        <Section title="Details">
          <Card>
            <PersonForm
              action={updatePersonAction.bind(null, organizationId, personId)}
              departments={departments}
              initial={person}
              submitLabel="Save"
            />
          </Card>
        </Section>
        <Section title="Teams">
          <LinkList
            empty="Not in a team. Add them from a team's page."
            items={teams.map((team) => ({
              id: team.id,
              href: orgPath(organizationId, `/teams/${team.id}`),
              label: team.name,
              detail: <ArchivedBadge status={team.status} />,
            }))}
          />
        </Section>
      </div>
    </>
  );
}
