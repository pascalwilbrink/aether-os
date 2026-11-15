import { createZodDto, zListServiceAccountsQuery } from '@pistis/core';

export class ListServiceAccountsQuery extends createZodDto(
  zListServiceAccountsQuery,
) {}
