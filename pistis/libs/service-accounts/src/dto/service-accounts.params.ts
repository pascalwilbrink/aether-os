import { createZodDto, zListServiceAccountsPath } from '@pistis/core';

export class ServiceAccountsParams extends createZodDto(
  zListServiceAccountsPath,
) {}
