import Link from "next/link";
import { Suspense } from "react";

import { ActionButton, RoleForm } from "@/app/components/action-forms";
import { listOrganizationUsers, listServiceAccounts } from "@/lib/api/pistis";
import { getOrganization, listMemberships } from "@/lib/api/polis";
import { requireOrganization } from "@/lib/auth/current";
import {
  ORGANIZATION_ROLES,
  people,
  roleLabel,
  serviceAccountRows,
} from "@/lib/members";
import { formatTime } from "@/lib/tasks";

import {
  changeRoleAction,
  grantServiceAccountAction,
  removeMemberAction,
  setServiceAccountEnabledAction,
} from "./actions";
import { NewServiceAccountForm } from "./new-service-account-form";

type Props = PageProps<"/orgs/[organizationId]/members">;

/** The organization's people and service accounts, and their organization roles. */
export default function MembersPage(props: Props) {
  return (
    <Suspense fallback={<p>Loading…</p>}>
      <Members {...props} />
    </Suspense>
  );
}

const SERVICE_ACCOUNT_ROLES = ORGANIZATION_ROLES.filter(
  ({ role }) => role === "member" || role === "viewer",
);

async function Members({ params }: Props) {
  const { organizationId } = await params;
  const session = await requireOrganization(
    organizationId,
    `/orgs/${organizationId}/members`,
  );
  const token = session.accessToken;
  const [organization, userMemberships, accountMemberships, users, accounts] =
    await Promise.all([
      getOrganization(token, organizationId),
      listMemberships(token, organizationId, "user"),
      listMemberships(token, organizationId, "service_account"),
      listOrganizationUsers(token, organizationId),
      listServiceAccounts(token, organizationId),
    ]);
  const members = people(userMemberships.items, users.items);
  const rows = serviceAccountRows(accounts.items, accountMemberships.items);
  const ref = (membershipId: string) => ({ organizationId, membershipId });

  return (
    <div className="space-y-10">
      <div>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={`/orgs/${organizationId}`} className="underline">
            {organization.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Organization roles. Roles in a project are on the project&apos;s page.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-medium">People</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr>
              <th className="py-1 font-normal">Name</th>
              <th className="py-1 font-normal">Member since</th>
              <th className="py-1 font-normal">Role</th>
              <th className="py-1 font-normal" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const self = member.subject === session.sub;
              return (
                <tr
                  key={member.membershipId}
                  className="border-t border-zinc-200 align-top dark:border-zinc-800"
                >
                  <td className="py-2">
                    <div>
                      {member.name}
                      {self ? (
                        <span className="text-zinc-500"> (you)</span>
                      ) : null}
                      {member.disabled ? (
                        <span className="text-zinc-500"> (disabled)</span>
                      ) : null}
                    </div>
                    {member.detail ? (
                      <div className="text-xs text-zinc-500">
                        {member.detail}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-2 text-zinc-600 dark:text-zinc-400">
                    {formatTime(member.since)}
                  </td>
                  <td className="py-2">
                    {self ? (
                      member.roles.map(roleLabel).join(", ")
                    ) : (
                      <RoleForm
                        action={changeRoleAction.bind(
                          null,
                          ref(member.membershipId),
                        )}
                        roles={ORGANIZATION_ROLES}
                        current={member.roles[0]}
                      />
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {self ? null : (
                      <ActionButton
                        action={removeMemberAction.bind(
                          null,
                          ref(member.membershipId),
                        )}
                        label="Remove"
                        pendingLabel="Removing…"
                        confirmText={`Remove ${member.name} from ${organization.name}? They lose every role in its projects too.`}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-zinc-500">
          People join by founding an organization for now; inviting someone by
          email comes with notifications.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">Service accounts</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          What tasks and automations run as: never a person. A task runs as one
          with a role in its project.
        </p>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No service accounts yet.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-zinc-500">
              <tr>
                <th className="py-1 font-normal">Name</th>
                <th className="py-1 font-normal">Status</th>
                <th className="py-1 font-normal">Role</th>
                <th className="py-1 font-normal" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ account, membership }) => {
                const accountRef = {
                  organizationId,
                  serviceAccountId: account.id,
                };
                return (
                  <tr
                    key={account.id}
                    className="border-t border-zinc-200 align-top dark:border-zinc-800"
                  >
                    <td className="py-2">
                      <div>{account.name}</div>
                      {account.description ? (
                        <div className="text-xs text-zinc-500">
                          {account.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2">
                      {account.status === "active" ? "Active" : "Disabled"}
                    </td>
                    <td className="py-2">
                      {membership ? (
                        <RoleForm
                          action={changeRoleAction.bind(
                            null,
                            ref(membership.id),
                          )}
                          roles={SERVICE_ACCOUNT_ROLES}
                          current={membership.roles[0]}
                        />
                      ) : (
                        <div className="space-y-1">
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            No role: it can&apos;t do anything.
                          </p>
                          <RoleForm
                            action={grantServiceAccountAction.bind(
                              null,
                              accountRef,
                            )}
                            roles={SERVICE_ACCOUNT_ROLES}
                            label="Grant"
                          />
                        </div>
                      )}
                    </td>
                    <td className="space-x-2 py-2 text-right">
                      <ActionButton
                        action={setServiceAccountEnabledAction.bind(null, {
                          ...accountRef,
                          enabled: account.status !== "active",
                        })}
                        label={
                          account.status === "active" ? "Disable" : "Enable"
                        }
                        pendingLabel="Saving…"
                        confirmText={
                          account.status === "active"
                            ? `Disable ${account.name}? Its API keys and tokens stop working, and tasks can't run as it.`
                            : undefined
                        }
                      />
                      {membership ? (
                        <ActionButton
                          action={removeMemberAction.bind(
                            null,
                            ref(membership.id),
                          )}
                          label="Remove role"
                          pendingLabel="Removing…"
                          confirmText={`Remove ${account.name}'s role? It loses its project roles too.`}
                        />
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <h3 className="pt-2 text-sm font-medium">New service account</h3>
        <NewServiceAccountForm organizationId={organizationId} />
      </section>
    </div>
  );
}
