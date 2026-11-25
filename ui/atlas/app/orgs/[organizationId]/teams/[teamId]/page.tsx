import Link from "next/link";
import { Suspense } from "react";

import {
  getTeam,
  listDepartments,
  listPersons,
  listTeamMembers,
} from "@/lib/api/polis";
import { requireAdmin } from "@/lib/auth/current";
import { orgPath, orNotFound, people } from "@/lib/pages";

import { ActionButton } from "../../../../components/action-button";
import {
  ArchivedBadge,
  Card,
  Loading,
  PageHeader,
  Section,
} from "../../../../components/ui";
import {
  addTeamMemberAction,
  archiveTeamAction,
  removeTeamMemberAction,
  updateTeamAction,
} from "../actions";
import { TeamForm } from "../team-form";
import { AddMemberForm } from "./add-member-form";

type Props = PageProps<"/orgs/[organizationId]/teams/[teamId]">;

/** A team: its details and departments, its members, archiving it. */
export default function TeamPage({ params }: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<Props, "params">) {
  const { organizationId, teamId } = await params;
  const { accessToken } = await requireAdmin(
    organizationId,
    orgPath(organizationId, `/teams/${teamId}`),
  );
  const team = await orNotFound(getTeam(accessToken, organizationId, teamId));
  const [departments, members, persons] = await Promise.all([
    listDepartments(accessToken, organizationId),
    listTeamMembers(accessToken, organizationId, teamId),
    listPersons(accessToken, organizationId),
  ]);
  const personById = new Map(persons.map((person) => [person.id, person]));
  const memberIds = new Set(members.map((member) => member.personId));
  const active = team.status === "active";

  return (
    <>
      <PageHeader
        title={team.name}
        description={
          <span className="inline-flex items-center gap-2">
            <span className="font-mono text-sm">{team.slug}</span>
            <ArchivedBadge status={team.status} />
          </span>
        }
        back={{ href: orgPath(organizationId, "/teams"), label: "Teams" }}
      >
        {active ? (
          <ActionButton
            action={archiveTeamAction.bind(null, organizationId, teamId)}
            label="Archive"
            pendingLabel="Archiving…"
            confirm={`Archive ${team.name}? It keeps its members but takes no changes afterwards, and can't be undone.`}
            danger
          />
        ) : null}
      </PageHeader>
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <Section title="Details">
          <Card>
            {active ? (
              <TeamForm
                action={updateTeamAction.bind(null, organizationId, teamId)}
                departments={departments}
                initial={team}
                submitLabel="Save"
              />
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {team.description || "No description."} An archived team
                doesn&apos;t change.
              </p>
            )}
          </Card>
        </Section>
        <Section title={`Members (${people(members.length)})`}>
          {members.length === 0 ? (
            <p className="text-sm text-zinc-500">No one is in the team yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {members.map((member) => {
                const person = personById.get(member.personId);
                return (
                  <li
                    key={member.personId}
                    className="flex items-center justify-between gap-4 px-4 py-2"
                  >
                    <Link
                      href={orgPath(organizationId, `/people/${member.personId}`)}
                      className="min-w-0"
                    >
                      <span className="block truncate font-medium">
                        {person?.name ?? "Someone"}
                      </span>
                      <span className="block truncate text-sm text-zinc-500">
                        {person?.role ?? person?.email}
                      </span>
                    </Link>
                    {active ? (
                      <ActionButton
                        action={removeTeamMemberAction.bind(
                          null,
                          organizationId,
                          teamId,
                          member.personId,
                        )}
                        label="Remove"
                        pendingLabel="Removing…"
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {active ? (
            <Card>
              <AddMemberForm
                action={addTeamMemberAction.bind(null, organizationId, teamId)}
                candidates={persons.filter((person) => !memberIds.has(person.id))}
              />
            </Card>
          ) : null}
        </Section>
      </div>
    </>
  );
}
