import type { OrganizationId, Page, PageRequest } from '@polis/core';

import type { Organization } from '../organization.js';

export abstract class OrganizationRepository {
  /** Throws OrganizationSlugTakenError if the slug is already in use. */
  abstract save(organization: Organization): Promise<void>;

  abstract findById(id: OrganizationId): Promise<Organization | null>;

  abstract findBySlug(slug: string): Promise<Organization | null>;

  /** Newest first. */
  abstract findAll(page: PageRequest): Promise<Page<Organization>>;
}
