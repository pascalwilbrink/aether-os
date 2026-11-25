import type {
  OrganizationRole,
  Membership,
  Person,
  ProjectMembership,
  ProjectRole,
  SubjectType,
} from "./api/polis";
import type { OrganizationUser, ServiceAccount } from "./api/pistis";

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
    hint: "Manages the organization, its people and projects; admin in every project",
  },
  { role: "member", label: "Member", hint: "Works in the projects they're given" },
  { role: "viewer", label: "Viewer", hint: "Reads, nothing more" },
];

/** Project roles that can be granted (project admins are the organization's owners and admins). */
export const PROJECT_ROLES: { role: ProjectRole; label: string; hint: string }[] = [
  {
    role: "approver",
    label: "Approver",
    hint: "Starts tasks and approves what agents produce",
  },
  { role: "editor", label: "Editor", hint: "Starts and manages tasks" },
  { role: "viewer", label: "Viewer", hint: "Reads the project" },
];

export const roleLabel = (role: OrganizationRole | ProjectRole): string =>
  [...ORGANIZATION_ROLES, ...PROJECT_ROLES].find((entry) => entry.role === role)
    ?.label ?? role;

export const isOrganizationRole = (value: unknown): value is OrganizationRole =>
  ORGANIZATION_ROLES.some((entry) => entry.role === value);
export const isProjectRole = (value: unknown): value is ProjectRole =>
  PROJECT_ROLES.some((entry) => entry.role === value);

/** The highest of a membership's roles: what Atlas shows and sets (one role each). */
export const highestRole = (roles: OrganizationRole[]): OrganizationRole =>
  ORGANIZATION_ROLES.find(({ role }) => roles.includes(role))?.role ?? "viewer";

/**
 * The organization roles someone may give: only owners make owners
 * (Polis refuses otherwise; this keeps the form from offering it).
 */
export const assignableRoles = (myRoles: readonly string[]) =>
  ORGANIZATION_ROLES.filter(
    ({ role }) => role !== "owner" || myRoles.includes("owner"),
  );

/** A user with an organization membership, with their profile and person. */
export interface Member {
  membershipId: string;
  userId: string;
  name: string;
  email: string | null;
  roles: OrganizationRole[];
  /** Their person in the organization, if one is linked to them. */
  personId: string | null;
  disabled: boolean;
}

/**
 * The organization's people with access: Polis's user memberships, named
 * from Pistis's profiles (or the person linked to them, or the ID).
 */
export function members(
  memberships: Membership[],
  users: OrganizationUser[],
  persons: Person[],
): Member[] {
  const userById = new Map(users.map((user) => [user.id, user]));
  const personByUser = new Map(
    persons.flatMap((person) => (person.userId ? [[person.userId, person]] : [])),
  );
  return memberships
    .filter((membership) => membership.subjectType === "user")
    .map((membership) => {
      const user = userById.get(membership.subject);
      const person = personByUser.get(membership.subject);
      return {
        membershipId: membership.id,
        userId: membership.subject,
        name:
          user?.displayName ??
          person?.name ??
          `Unknown user ${membership.subject.slice(0, 8)}`,
        email: user?.email ?? person?.email ?? null,
        roles: membership.roles,
        personId: person?.id ?? null,
        disabled: user?.status === "disabled",
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** People who've signed up (linked to a user) but have no access yet. */
export function withoutAccess(persons: Person[], memberships: Membership[]): Person[] {
  const memberIds = new Set(
    memberships
      .filter((membership) => membership.subjectType === "user")
      .map((membership) => membership.subject),
  );
  return persons.filter((person) => person.userId && !memberIds.has(person.userId));
}

/** Someone (or a service account) with a role in a project. */
export interface ProjectGrant {
  grant: ProjectMembership;
  name: string;
  detail: string | null;
}

/** A project's grants, named from the organization's members and service accounts. */
export function projectGrants(
  grants: ProjectMembership[],
  people: Member[],
  accounts: ServiceAccount[],
): ProjectGrant[] {
  return grants.map((grant) => {
    if (grant.subjectType === "service_account") {
      const account = accounts.find((a) => a.id === grant.subject);
      return {
        grant,
        name: account?.name ?? `Service account ${grant.subject.slice(0, 8)}`,
        detail: "Service account",
      };
    }
    const member = people.find((m) => m.userId === grant.subject);
    return {
      grant,
      name: member?.name ?? `Unknown user ${grant.subject.slice(0, 8)}`,
      detail: member?.email ?? null,
    };
  });
}

/**
 * Members a project role would mean something for: no role in the project
 * yet, and not an owner or admin (admins in every project already).
 */
export function withoutProjectRole(
  people: Member[],
  grants: ProjectMembership[],
): Member[] {
  const granted = new Set(
    grants.filter((g) => g.subjectType === "user").map((g) => g.subject),
  );
  return people.filter(
    (member) =>
      !granted.has(member.userId) &&
      !member.roles.some((role) => role === "owner" || role === "admin"),
  );
}

/**
 * The project roles someone can be given (Polis decides; this keeps the
 * form from offering what it would refuse): service accounts up to editor,
 * organization viewers only viewer.
 */
export function grantableProjectRoles(
  subjectType: SubjectType,
  roles: OrganizationRole[],
): ProjectRole[] {
  const viewerOnly = roles.length > 0 && roles.every((role) => role === "viewer");
  if (viewerOnly) return ["viewer"];
  return subjectType === "service_account"
    ? ["editor", "viewer"]
    : ["approver", "editor", "viewer"];
}
