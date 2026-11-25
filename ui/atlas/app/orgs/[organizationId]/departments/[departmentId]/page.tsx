import { Suspense } from "react";

import {
  getDepartment,
  listPersons,
  listProjectsInDepartment,
  listTeams,
} from "@/lib/api/polis";
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
import { archiveDepartmentAction, updateDepartmentAction } from "../actions";
import { DepartmentForm } from "../department-form";

type Props = PageProps<"/orgs/[organizationId]/departments/[departmentId]">;

/** A department: its name and description, who and what is in it, archiving it. */
export default function DepartmentPage({ params }: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<Props, "params">) {
  const { organizationId, departmentId } = await params;
  const { accessToken } = await requireAdmin(
    organizationId,
    orgPath(organizationId, `/departments/${departmentId}`),
  );
  const department = await orNotFound(
    getDepartment(accessToken, organizationId, departmentId),
  );
  const [persons, teams, projects] = await Promise.all([
    listPersons(accessToken, organizationId, { departmentId }),
    listTeams(accessToken, organizationId, { departmentId }),
    listProjectsInDepartment(accessToken, organizationId, departmentId),
  ]);
  const active = department.status === "active";

  return (
    <>
      <PageHeader
        title={department.name}
        description={
          <span className="inline-flex items-center gap-2">
            <span className="font-mono text-sm">{department.slug}</span>
            <ArchivedBadge status={department.status} />
          </span>
        }
        back={{
          href: orgPath(organizationId, "/departments"),
          label: "Departments",
        }}
      >
        {active ? (
          <ActionButton
            action={archiveDepartmentAction.bind(
              null,
              organizationId,
              departmentId,
            )}
            label="Archive"
            pendingLabel="Archiving…"
            confirm={`Archive ${department.name}? It takes no new projects, people or teams afterwards, and can't be undone.`}
            danger
          />
        ) : null}
      </PageHeader>
      <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-8">
          <Section title="Details">
            <Card>
              {active ? (
                <DepartmentForm
                  action={updateDepartmentAction.bind(
                    null,
                    organizationId,
                    departmentId,
                  )}
                  initial={department}
                  submitLabel="Save"
                />
              ) : (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {department.description || "No description."} An archived
                  department doesn&apos;t change.
                </p>
              )}
            </Card>
          </Section>
          <Section title="Projects">
            <p className="text-sm text-zinc-500">
              Projects are created and moved between departments in Iris.
            </p>
            {projects.length === 0 ? (
              <p className="text-sm text-zinc-500">No projects in it.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {projects.map((project) => (
                  <li key={project.id} className="flex items-center gap-2">
                    {project.name}
                    <ArchivedBadge status={project.status} />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
        <div className="space-y-8">
          <Section title="People">
            <LinkList
              empty="No one is in it."
              items={persons.map((person) => ({
                id: person.id,
                href: orgPath(organizationId, `/people/${person.id}`),
                label: person.name,
                detail: person.role ?? person.email,
              }))}
            />
          </Section>
          <Section title="Teams">
            <LinkList
              empty="No teams are in it."
              items={teams.map((team) => ({
                id: team.id,
                href: orgPath(organizationId, `/teams/${team.id}`),
                label: team.name,
                detail: <ArchivedBadge status={team.status} />,
              }))}
            />
          </Section>
        </div>
      </div>
    </>
  );
}
