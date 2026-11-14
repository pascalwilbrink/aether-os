import type {
  Organization,
  OrganizationStatus,
} from '../../../domain/organization.js';

import type { ApiSchema } from '@hephaestus/core';

export class OrganizationResponse implements ApiSchema<'OrganizationResponse'> {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;

  static fromDomain(organization: Organization): OrganizationResponse {
    return Object.assign(new OrganizationResponse(), {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      createdBy: organization.createdBy,
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
    } satisfies OrganizationResponse);
  }
}
