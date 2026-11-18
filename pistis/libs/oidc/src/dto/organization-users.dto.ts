import {
  createZodDto,
  zListOrganizationUsersPath,
  zListOrganizationUsersQuery,
  zOrganizationUserPage,
} from '@pistis/core';

export class OrganizationUsersParams extends createZodDto(
  zListOrganizationUsersPath,
) {}

/** `?limit=&cursor=` (Polis's cursor). */
export class ListOrganizationUsersQuery extends createZodDto(
  zListOrganizationUsersQuery,
) {}

export class OrganizationUserPage extends createZodDto(zOrganizationUserPage) {}
