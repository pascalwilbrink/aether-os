import "server-only";

import { listOrganizationUsers } from "./api/pistis";
import { listMemberships, listPersons } from "./api/polis";
import { organizationRoles } from "@aether-os/sign-in";
import type { Session } from "@aether-os/sign-in";
import { members } from "./members";

/**
 * The organization's members (named from Pistis, linked to their persons),
 * its persons and memberships, and who's asking (their `sub` and roles).
 */
export async function loadAccess(session: Session, organizationId: string) {
  const token = session.accessToken;
  const [memberships, users, persons] = await Promise.all([
    listMemberships(token, organizationId, "user"),
    listOrganizationUsers(token, organizationId),
    listPersons(token, organizationId),
  ]);
  return {
    memberships,
    persons,
    members: members(memberships, users, persons),
    me: { sub: session.sub, roles: organizationRoles(session.accessToken) },
  };
}
