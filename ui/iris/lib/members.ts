import type { OrganizationUser, ServiceAccount } from "./api/pistis";
import type {
  Membership,
  OrganizationRole,
  ProjectMembership,
  ProjectRole,
  SubjectType,
} from "./api/polis";

/** Organization roles, highest first, with what they allow (`docs/identity.md`). */
export const ORGANIZATION_ROLES: {
  role: OrganizationRole;
  label: string;
  hint: string;
}[] = [
  { role: "owner", label: "Owner", hint: "Everything, including other owners" },
  {
    role: "admin",
    label: "Admin",
    hint: "Manages members, projects and agents; admin in every project",
  },
  {
    role: "member",
    label: "Member",
    hint: "Works in the projects they're given",
  },
  { role: "viewer", label: "Viewer", hint: "Reads, nothing more" },
];

/** Project roles that can be granted (project admins are the organization's owners and admins). */
export const PROJECT_ROLES: {
  role: ProjectRole;
  label: string;
  hint: string;
}[] = [
  {
    role: "approver",
    label: "Approver",
    hint: "Starts tasks and approves what agents produce",
  },
  { role: "editor", label: "Editor", hint: "Starts and manages tasks" },
  { role: "viewer", label: "Viewer", hint: "Reads the project" },
];

export const roleLabel = (role: OrganizationRole | ProjectRole) =>
  [...ORGANIZATION_ROLES, ...PROJECT_ROLES].find((entry) => entry.role === role)
    ?.label ?? role;

export const isOrganizationRole = (value: unknown): value is OrganizationRole =>
  ORGANIZATION_ROLES.some((entry) => entry.role === value);
export const isProjectRole = (value: unknown): value is ProjectRole =>
  PROJECT_ROLES.some((entry) => entry.role === value);

/** Someone (or something) with an organization membership. */
export interface Member {
  membershipId: string;
  subjectType: SubjectType;
  subject: string;
  name: string;
  /** Email for people, the description for service accounts. */
  detail: string | null;
  roles: OrganizationRole[];
  since: string;
  /** Service accounts only: whether it can still get tokens. */
  disabled: boolean;
}

/** People: Polis's user memberships with Pistis's profiles (an unknown one by its ID). */
export function people(
  memberships: Membership[],
  users: OrganizationUser[],
): Member[] {
  const byId = new Map(users.map((user) => [user.id, user]));
  return memberships
    .filter((membership) => membership.subjectType === "user")
    .map((membership) => {
      const user = byId.get(membership.subject);
      return {
        membershipId: membership.id,
        subjectType: "user",
        subject: membership.subject,
        name:
          user?.displayName ?? `Unknown user ${membership.subject.slice(0, 8)}`,
        detail: user?.email ?? null,
        roles: membership.roles,
        since: membership.createdAt,
        disabled: user?.status === "disabled",
      };
    });
}

/** A service account, with its organization membership if it has one. */
export interface ServiceAccountRow {
  account: ServiceAccount;
  membership: Membership | null;
}

/** Every service account, and its organization roles (none until granted). */
export function serviceAccountRows(
  accounts: ServiceAccount[],
  memberships: Membership[],
): ServiceAccountRow[] {
  const bySubject = new Map(
    memberships
      .filter((m) => m.subjectType === "service_account")
      .map((m) => [m.subject, m]),
  );
  return accounts.map((account) => ({
    account,
    membership: bySubject.get(account.id) ?? null,
  }));
}

/** Service accounts as members, for project access. */
export function serviceAccountMembers(rows: ServiceAccountRow[]): Member[] {
  return rows.flatMap(({ account, membership }) =>
    membership
      ? [
          {
            membershipId: membership.id,
            subjectType: "service_account" as const,
            subject: account.id,
            name: account.name,
            detail: account.description || null,
            roles: membership.roles,
            since: membership.createdAt,
            disabled: account.status === "disabled",
          },
        ]
      : [],
  );
}

/** A role in a project, with who holds it. */
export interface ProjectAccess {
  membership: ProjectMembership;
  member: Member | null;
}

export function projectAccess(
  grants: ProjectMembership[],
  members: Member[],
): ProjectAccess[] {
  return grants.map((membership) => ({
    membership,
    member:
      members.find(
        (m) =>
          m.subjectType === membership.subjectType &&
          m.subject === membership.subject,
      ) ?? null,
  }));
}

/**
 * Organization members a project role would mean something for: not yet
 * granted one, and not an owner or admin (admins in every project already).
 */
export function withoutProjectRole(
  members: Member[],
  grants: ProjectMembership[],
): Member[] {
  const granted = new Set(
    grants.map((grant) => `${grant.subjectType}/${grant.subject}`),
  );
  return members.filter(
    (member) =>
      !granted.has(`${member.subjectType}/${member.subject}`) &&
      !member.roles.some((role) => role === "owner" || role === "admin"),
  );
}

/**
 * The project roles a member can be given (Polis decides; this only keeps
 * the form from offering what it would refuse): service accounts up to
 * editor (only people approve), organization viewers only viewer.
 */
export function grantableProjectRoles(
  member: Pick<Member, "subjectType" | "roles">,
): ProjectRole[] {
  if (member.subjectType === "service_account") {
    return member.roles.includes("viewer") && member.roles.length === 1
      ? ["viewer"]
      : ["editor", "viewer"];
  }
  return member.roles.length === 1 && member.roles[0] === "viewer"
    ? ["viewer"]
    : ["approver", "editor", "viewer"];
}

/**
 * Service accounts a task in the project can run as: active, and with a
 * role in the project (Pistis's task token needs one).
 */
export function runnableServiceAccounts(
  accounts: ServiceAccount[],
  grants: ProjectMembership[],
): ServiceAccount[] {
  const granted = new Set(
    grants
      .filter((grant) => grant.subjectType === "service_account")
      .map((grant) => grant.subject),
  );
  return accounts.filter(
    (account) => account.status === "active" && granted.has(account.id),
  );
}
