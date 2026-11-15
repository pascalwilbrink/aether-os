/**
 * Access tokens are requested for a resource (RFC 8707 resource indicators):
 *
 * - `urn:aether-os` (the default): a token without an organization, e.g.
 *   to list the user's organizations;
 * - `urn:aether-os:org:<organizationId>`: a token for one organization, with
 *   `org_id` and `org_roles` (docs/identity.md: one organization per token).
 *
 * Every Aether-os service accepts the audience `aether-os`.
 */
export const PLATFORM_RESOURCE = 'urn:aether-os';
export const AUDIENCE = 'aether-os';
/** The scope clients request for Aether-os access tokens. */
export const API_SCOPE = 'api';

const ORG_RESOURCE =
  /^urn:aether-os:org:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export function organizationResource(organizationId: string): string {
  return `${PLATFORM_RESOURCE}:org:${organizationId}`;
}

/** The organization a resource is for; null for the platform resource; undefined if invalid. */
export function organizationOf(resource: string): string | null | undefined {
  if (resource === PLATFORM_RESOURCE) {
    return null;
  }
  return ORG_RESOURCE.exec(resource)?.[1];
}

/** The requested resources of an authorization request, defaulting to the platform. */
export function requestedResources(resource: unknown): string[] {
  if (Array.isArray(resource)) {
    return resource.filter(
      (value): value is string => typeof value === 'string',
    );
  }
  return typeof resource === 'string' ? [resource] : [PLATFORM_RESOURCE];
}
