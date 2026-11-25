/**
 * Atlas is for the people who manage an organization: its owners and
 * admins (`docs/identity.md`). Polis checks every call itself
 * (`org:manage`, `member:manage`); this only decides who gets in.
 */
export const ADMIN_ROLES = ["owner", "admin"] as const;

/** Whether organization roles include an owner's or an admin's. */
export const isAdmin = (roles: readonly string[]): boolean =>
  roles.some((role) => (ADMIN_ROLES as readonly string[]).includes(role));
