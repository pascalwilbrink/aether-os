import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { CreateDepartmentRequest } from './dto/create-department.request.js';
import type { DepartmentResponse } from './dto/department.response.js';
import { DepartmentEntity } from './department.entity.js';

@Injectable()
export class DepartmentMapper {
  /** A new, active department; its ID (UUIDv7) is generated here. */
  toEntity(
    dto: CreateDepartmentRequest,
    organizationId: string,
    createdBy: string,
    now: Date,
  ): DepartmentEntity {
    return Object.assign(new DepartmentEntity(), {
      id: uuidv7(),
      organizationId,
      name: dto.name,
      slug: dto.slug,
      description: dto.description,
      status: 'active',
      createdBy,
      createdAt: now,
      updatedAt: now,
      version: 1,
    } satisfies DepartmentEntity);
  }

  toResponse(entity: DepartmentEntity): DepartmentResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      name: entity.name,
      slug: entity.slug,
      description: entity.description,
      status: entity.status,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
    };
  }
}
