import { Injectable } from '@nestjs/common';

import type { ApiTypes, Page, PageRequest } from '@pistis/core';
import { UsersService } from '@pistis/users';

import { PolisDirectory } from './polis-directory.js';

type OrganizationUser = ApiTypes.OrganizationUserResponse;

/**
 * The organization's people: who is a member comes from Polis (so only
 * members are ever shown), their profile from Pistis. Roles stay in Polis.
 */
@Injectable()
export class OrganizationUsersService {
  constructor(
    private readonly polis: PolisDirectory,
    private readonly users: UsersService,
  ) {}

  async list(
    organizationId: string,
    page: PageRequest,
  ): Promise<Page<OrganizationUser>> {
    const { subjects, nextCursor } = await this.polis.userMembers(
      organizationId,
      { limit: page.limit, cursor: page.cursor ?? undefined },
    );
    const byId = new Map(
      (await this.users.findByIds(subjects.filter(isUuid))).map((user) => [
        user.id,
        user,
      ]),
    );
    // In Polis's order; a member Pistis doesn't know is left out.
    const items = subjects.flatMap((subject) => {
      const user = byId.get(subject);
      return user
        ? [
            {
              id: user.id,
              displayName: user.displayName,
              email: user.email,
              status: user.status,
            },
          ]
        : [];
    });

    return { items, nextCursor };
  }
}

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
