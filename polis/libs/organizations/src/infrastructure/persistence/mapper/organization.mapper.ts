import { Injectable } from '@nestjs/common';

import type { OrganizationId } from '@polis/core';

import { Organization } from '../../../domain/organization.js';
import { OrganizationEntity } from '../entity/organization.entity.js';

@Injectable()
export class OrganizationMapper {
  toEntity(organization: Organization): OrganizationEntity {
    return Object.assign(new OrganizationEntity(), {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      status: organization.status,
      createdBy: organization.createdBy,
      createdAt: organization.createdAt,
      updatedAt: organization.updatedAt,
    } satisfies OrganizationEntity);
  }

  toDomain(entity: OrganizationEntity): Organization {
    return Organization.reconstitute({
      id: entity.id as OrganizationId,
      name: entity.name,
      slug: entity.slug,
      status: entity.status,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
    });
  }
}
