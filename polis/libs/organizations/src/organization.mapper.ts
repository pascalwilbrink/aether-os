import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { CreateOrganizationRequest } from './dto/create-organization.request.js';
import type { OrganizationResponse } from './dto/organization.response.js';
import { OrganizationEntity } from './organization.entity.js';

@Injectable()
export class OrganizationMapper {
  /** A new, active organization; its ID (UUIDv7) is generated here. */
  toEntity(dto: CreateOrganizationRequest, now: Date): OrganizationEntity {
    return Object.assign(new OrganizationEntity(), {
      id: uuidv7(),
      name: dto.name,
      slug: dto.slug,
      status: 'active',
      createdBy: dto.createdBy,
      createdAt: now,
      updatedAt: now,
      version: 1,
    } satisfies OrganizationEntity);
  }

  toResponse(entity: OrganizationEntity): OrganizationResponse {
    return {
      id: entity.id,
      name: entity.name,
      slug: entity.slug,
      status: entity.status,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
    };
  }
}
