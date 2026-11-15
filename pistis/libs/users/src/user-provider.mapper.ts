import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import type { LinkUserProviderRequest } from './dto/link-user-provider.request.js';
import type { UserProviderResponse } from './dto/user-provider.response.js';
import { UserProviderEntity } from './user-provider.entity.js';

@Injectable()
export class UserProviderMapper {
  /** A new link of an identity to a user; its ID (UUIDv7) is generated here. */
  toEntity(
    dto: LinkUserProviderRequest,
    userId: string,
    now: Date,
  ): UserProviderEntity {
    return Object.assign(new UserProviderEntity(), {
      id: uuidv7(),
      userId,
      provider: dto.provider,
      subject: dto.subject,
      email: dto.email,
      emailVerified: dto.emailVerified,
      createdAt: now,
      lastSignInAt: null,
    } satisfies Omit<UserProviderEntity, 'user'>);
  }

  toResponse(entity: UserProviderEntity): UserProviderResponse {
    return {
      id: entity.id,
      userId: entity.userId,
      provider: entity.provider,
      subject: entity.subject,
      email: entity.email,
      emailVerified: entity.emailVerified,
      createdAt: entity.createdAt.toISOString(),
      lastSignInAt: entity.lastSignInAt?.toISOString() ?? null,
    };
  }
}
