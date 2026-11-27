/** A role a person holds on a resource (episteme/CLAUDE.md, Stewardship). */
export type StewardRole = 'owner' | 'maintainer' | 'reviewer' | 'approver';

export interface Steward {
  role: StewardRole;
  personId: string;
}

export interface Scope {
  type: 'department' | 'team' | 'project';
  id: string;
}

/** Each role and person once, in a stable order (role, then person). */
export function normalizeStewards(stewards: readonly Steward[]): Steward[] {
  const order: Record<StewardRole, number> = {
    owner: 0,
    maintainer: 1,
    reviewer: 2,
    approver: 3,
  };
  const seen = new Set<string>();
  return stewards
    .filter((steward) => {
      const key = `${steward.role}:${steward.personId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(
      (a, b) =>
        order[a.role] - order[b.role] || a.personId.localeCompare(b.personId),
    );
}

/** Every resource has an owner, always. */
export function hasOwner(stewards: readonly Steward[]): boolean {
  return stewards.some((steward) => steward.role === 'owner');
}

/** Each scope once, in a stable order. */
export function normalizeScopes(scopes: readonly Scope[]): Scope[] {
  const seen = new Set<string>();
  return scopes
    .filter((scope) => {
      const key = `${scope.type}:${scope.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
}

/** Tags lowercased, each once, in the order given. */
export function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map((tag) => tag.toLowerCase()))];
}

/** The persons holding any of these roles. */
export function personsIn(
  stewards: readonly Steward[],
  roles: readonly StewardRole[],
): Set<string> {
  return new Set(
    stewards
      .filter((steward) => roles.includes(steward.role))
      .map((steward) => steward.personId),
  );
}
