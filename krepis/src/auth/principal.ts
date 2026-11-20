import { z } from 'zod';

import {
  ORGANIZATION_ROLES,
  PROJECT_ROLES,
  type OrganizationRole,
  type ProjectRole,
} from './permissions.js';

/** Who is calling: taken from a verified Pistis access token (docs/identity.md, Tokens). */
export interface Principal {
  /** The principal's Pistis ID (a user, a service account) or a service's client ID. */
  readonly sub: string;
  readonly subType: 'user' | 'service_account' | 'service';
  /** The token's organization; null for platform tokens. */
  readonly organizationId: string | null;
  readonly organizationRoles: readonly OrganizationRole[];
  /** Explicit project grants, by project ID. */
  readonly projectRoles: Readonly<Record<string, ProjectRole>>;
  /** Task tokens: the one project the token is limited to. */
  readonly projectId: string | null;
  readonly taskId: string | null;
  /** Task tokens: the task's tree (its top-level task), for its budget (docs/pylon.md). */
  readonly taskTreeId: string | null;
  /** Task tokens: the agent and version the task runs, for budgets, keys and attribution. */
  readonly agentId: string | null;
  readonly agentVersionId: string | null;
  /** Who acts on the principal's behalf (token exchange). */
  readonly actor: { readonly sub: string } | null;
  /** The token's scopes (`scope`). */
  readonly scopes: readonly string[];
}

const zUuid = z.uuid();

/** The Aether-os claims of an access token, after its signature was verified. */
export const zAccessTokenClaims = z
  .object({
    sub: z.string().min(1),
    sub_type: z.enum(['user', 'service_account', 'service']),
    org_id: zUuid.optional(),
    org_roles: z
      .array(
        z.enum(ORGANIZATION_ROLES as [OrganizationRole, ...OrganizationRole[]]),
      )
      .optional(),
    project_roles: z
      .record(zUuid, z.enum(PROJECT_ROLES as [ProjectRole, ...ProjectRole[]]))
      .optional(),
    project_id: zUuid.optional(),
    task_id: z.string().optional(),
    task_tree_id: zUuid.optional(),
    agent_id: zUuid.optional(),
    agent_version_id: zUuid.optional(),
    act: z.object({ sub: z.string() }).loose().optional(),
    scope: z.string().optional(),
  })
  .loose()
  .refine(
    (claims) => !claims.org_id || claims.sub_type !== 'service',
    'service tokens have no organization',
  )
  .refine(
    (claims) => !claims.project_id || claims.org_id,
    'project_id needs org_id',
  );

export function principalFromClaims(
  claims: z.infer<typeof zAccessTokenClaims>,
): Principal {
  return {
    sub: claims.sub,
    subType: claims.sub_type,
    organizationId: claims.org_id ?? null,
    organizationRoles: claims.org_id
      ? [...new Set(claims.org_roles ?? [])]
      : [],
    projectRoles: claims.org_id ? (claims.project_roles ?? {}) : {},
    projectId: claims.project_id ?? null,
    taskId: claims.task_id ?? null,
    taskTreeId: claims.task_tree_id ?? null,
    agentId: claims.agent_id ?? null,
    agentVersionId: claims.agent_version_id ?? null,
    actor: claims.act ? { sub: claims.act.sub } : null,
    scopes: claims.scope?.split(' ').filter(Boolean) ?? [],
  };
}
