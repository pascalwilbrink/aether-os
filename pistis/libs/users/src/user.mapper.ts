import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { UpdateUserRequest } from './dto/update-user.request.js';
import type { UserResponse } from './dto/user.response.js';
import { UserEntity } from './user.entity.js';

export interface NewUser {
  displayName: string;
  email: string | null;
}

@Injectable()
export class UserMapper {
  /** A new, active user; its ID (UUIDv7, the future `sub`) is generated here. */
  toEntity(user: NewUser, now: Date): UserEntity {
    return Object.assign(new UserEntity(), {
      id: uuidv7(),
      displayName: user.displayName,
      email: user.email,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastSignInAt: null,
      version: 1,
    } satisfies UserEntity);
  }

  /** PUT: every editable field replaced. */
  applyTo(entity: UserEntity, dto: UpdateUserRequest, now: Date): UserEntity {
    entity.displayName = dto.displayName;
    entity.email = dto.email;
    entity.updatedAt = now;

    return entity;
  }

  toResponse(entity: UserEntity): UserResponse {
    return {
      id: entity.id,
      displayName: entity.displayName,
      email: entity.email,
      status: entity.status,
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
      lastSignInAt: entity.lastSignInAt?.toISOString() ?? null,
    };
  }
}
