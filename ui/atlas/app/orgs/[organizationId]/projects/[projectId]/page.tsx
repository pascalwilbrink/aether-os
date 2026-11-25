import { Suspense } from "react";

import { loadAccess } from "@/lib/access";
import { listServiceAccounts } from "@/lib/api/pistis";
import {
  getProject,
  listMemberships,
  listProjectMemberships,
} from "@/lib/api/polis";
import { requireAdmin } from "@/lib/auth/current";
import {
  grantableProjectRoles,
  PROJECT_ROLES,
  projectGrants,
  roleLabel,
  withoutProjectRole,
} from "@/lib/members";
import { orgPath, orNotFound } from "@/lib/pages";

import { ActionButton } from "../../../../components/action-button";
import { GrantForm, RoleForm } from "../../../../components/role-forms";
import {
  ArchivedBadge,
  Card,
  Loading,
  PageHeader,
  Section,
} from "../../../../components/ui";
import {
  changeProjectRoleAction,
  grantProjectRoleAction,
  removeProjectRoleAction,
} from "../actions";

type Props = PageProps<"/orgs/[organizationId]/projects/[projectId]">;

/** Who works in a project, with which role: giving, changing and taking roles. */
export default function ProjectPage({ params }: Props) {
  return (
    <Suspense fallback={<Loading />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: Pick<Props, "params">) {
  const { organizationId, projectId } = await params;
  const session = await requireAdmin(
    organizationId,
    orgPath(organizationId, `/projects/${projectId}`),
  );
  const token = session.accessToken;
  const project = await orNotFound(getProject(token, organizationId, projectId));
  const [{ members }, grants, accounts, accountMemberships] = await Promise.all([
    loadAccess(session, organizationId),
    listProjectMemberships(token, organizationId, projectId),
    listServiceAccounts(token, organizationId),
    listMemberships(token, organizationId, "service_account"),
  ]);
  const rows = projectGrants(grants, members, accounts);
  const active = project.status === "active";
  const rolesOf = (subjectType: string, subject: string) =>
    (subjectType === "user"
      ? members.find((m) => m.userId === subject)?.roles
      : accountMemberships.find((m) => m.subject === subject)?.roles) ?? [];
  const roleChoices = (subjectType: "user" | "service_account", subject: string) =>
    PROJECT_ROLES.filter(({ role }) =>
      grantableProjectRoles(subjectType, rolesOf(subjectType, subject)).includes(role),
    );
  const candidates = withoutProjectRole(members, grants);
  const admins = members.filter((m) =>
    m.roles.some((role) => role === "owner" || role === "admin"),
  );

  return (
    <>
      <PageHeader
        title={project.name}
        description={
          <span className="inline-flex items-center gap-2">
            <span className="font-mono text-sm">{project.slug}</span>
            <ArchivedBadge status={project.status} />
          </span>
        }
        back={{ href: orgPath(organizationId, "/projects"), label: "Projects" }}
      />
      <div className="grid items-start gap-8 lg:grid-cols-[3fr_2fr]">
        <Section title={`Roles in the project (${rows.length})`}>
          {rows.length === 0 ? (
            <p className="text-sm text-zinc-500">No one has a role in it yet.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
              {rows.map(({ grant, name, detail }) => (
                <li
                  key={grant.id}
                  className="flex flex-wrap items-center justify-between gap-4 px-4 py-3"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{name}</span>
                    <span className="block truncate text-sm text-zinc-500">
                      {detail}
                    </span>
                  </div>
                  {active ? (
                    <div className="flex flex-wrap items-start gap-2">
                      <RoleForm
                        action={changeProjectRoleAction.bind(
                          null,
                          organizationId,
                          projectId,
                          grant.id,
                        )}
                        roles={roleChoices(grant.subjectType, grant.subject)}
                        current={grant.role}
                        label={`${name}'s role in ${project.name}`}
                      />
                      <ActionButton
                        action={removeProjectRoleAction.bind(
                          null,
                          organizationId,
                          projectId,
                          grant.id,
                        )}
                        label="Remove"
                        pendingLabel="Removing…"
                      />
                    </div>
                  ) : (
                    <span className="text-sm">{roleLabel(grant.role)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <div className="space-y-8">
          {active ? (
            <Section title="Give a role">
              <Card>
                <GrantForm
                  action={grantProjectRoleAction.bind(
                    null,
                    organizationId,
                    projectId,
                  )}
                  candidates={candidates.map((member) => ({
                    value: member.userId,
                    label: `${member.name}${member.email ? ` (${member.email})` : ""}`,
                  }))}
                  roles={PROJECT_ROLES}
                  defaultRole="editor"
                  submitLabel="Give role"
                  empty="Every member who could have a role here has one."
                />
                <p className="mt-2 text-xs text-zinc-500">
                  Viewers of the organization can only be viewers here; Polis
                  says so if a role is too high.
                </p>
              </Card>
            </Section>
          ) : (
            <p className="text-sm text-zinc-500">
              An archived project&apos;s roles don&apos;t change.
            </p>
          )}
          <Section title="Admins of every project">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              The organization&apos;s owners and admins:{" "}
              {admins.map((m) => m.name).join(", ") || "none"}.
            </p>
          </Section>
        </div>
      </div>
    </>
  );
}
