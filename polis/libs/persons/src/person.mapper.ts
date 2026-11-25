import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { PersonRequest } from './dto/person.request.js';
import type { PersonResponse } from './dto/person.response.js';
import { PersonEntity } from './person.entity.js';

/** A person's fields from a request: the email in lowercase, text trimmed. */
export function personFields(
  dto: PersonRequest,
): Pick<PersonEntity, 'name' | 'email' | 'description' | 'role' | 'gender'> {
  const optional = (value: string | null | undefined) =>
    value?.trim() ? value.trim() : null;
  return {
    name: dto.name.trim(),
    email: dto.email.trim().toLowerCase(),
    description: (dto.description ?? '').trim(),
    role: optional(dto.role),
    gender: optional(dto.gender),
  };
}

@Injectable()
export class PersonMapper {
  /** A new person, not linked yet; its ID (UUIDv7) is generated here. */
  toEntity(
    dto: PersonRequest,
    organizationId: string,
    createdBy: string,
    now: Date,
  ): PersonEntity {
    return Object.assign(new PersonEntity(), {
      id: uuidv7(),
      organizationId,
      ...personFields(dto),
      userId: null,
      createdBy,
      createdAt: now,
      updatedAt: now,
      version: 1,
    } satisfies PersonEntity);
  }

  toResponse(entity: PersonEntity, departmentIds: string[]): PersonResponse {
    return {
      id: entity.id,
      organizationId: entity.organizationId,
      name: entity.name,
      email: entity.email,
      description: entity.description,
      role: entity.role,
      gender: entity.gender,
      departmentIds,
      userId: entity.userId,
      createdBy: entity.createdBy,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      version: entity.version,
    };
  }
}
