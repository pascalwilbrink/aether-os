import { decodeJwt } from "jose";

/**
 * The organization roles in an access token (`org_roles`), read without
 * verifying it: for display and navigation only. The services check the
 * token themselves.
 */
export function organizationRoles(accessToken: string): string[] {
  try {
    const roles = decodeJwt(accessToken).org_roles;
    return Array.isArray(roles) ? roles.map(String) : [];
  } catch {
    return [];
  }
}
