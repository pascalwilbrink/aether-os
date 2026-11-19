import {
  createZodDto,
  zModelKeyList,
  zModelKeyResponse,
  zSetModelKeyRequest,
  zSetOrganizationModelKeyPath,
  zListOrganizationModelKeysPath,
} from '@hephaestus/core';

export class SetModelKeyRequest extends createZodDto(zSetModelKeyRequest) {}
export class ModelKeyResponse extends createZodDto(zModelKeyResponse) {}
export class ModelKeyList extends createZodDto(zModelKeyList) {}

/** `:organizationId`. */
export class OrganizationModelKeysParams extends createZodDto(
  zListOrganizationModelKeysPath,
) {}

/** `:organizationId` and `:provider`. */
export class OrganizationModelKeyParams extends createZodDto(
  zSetOrganizationModelKeyPath,
) {}
