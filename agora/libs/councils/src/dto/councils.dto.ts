import {
  createZodDto,
  zCouncilPage,
  zCouncilResponse,
  zCouncilVersionPage,
  zCouncilVersionResponse,
  zCreateCouncilRequest,
  zCreateCouncilVersionRequest,
  zGetCouncilPath,
  zGetCouncilVersionPath,
  zListCouncilsPath,
  zListCouncilsQuery,
  zListCouncilVersionsQuery,
} from '@agora/core';

/** `:organizationId` (a UUID). */
export class CouncilsParams extends createZodDto(zListCouncilsPath) {}
/** `:organizationId` and `:councilId` (UUIDs). */
export class CouncilParams extends createZodDto(zGetCouncilPath) {}
/** `:organizationId`, `:councilId` and `:versionId` (UUIDs). */
export class CouncilVersionParams extends createZodDto(
  zGetCouncilVersionPath,
) {}
export class ListCouncilsQuery extends createZodDto(zListCouncilsQuery) {}
export class ListCouncilVersionsQuery extends createZodDto(
  zListCouncilVersionsQuery,
) {}
export class CreateCouncilRequest extends createZodDto(zCreateCouncilRequest) {}
export class CreateCouncilVersionRequest extends createZodDto(
  zCreateCouncilVersionRequest,
) {}
export class CouncilResponse extends createZodDto(zCouncilResponse) {}
export class CouncilPage extends createZodDto(zCouncilPage) {}
export class CouncilVersionResponse extends createZodDto(
  zCouncilVersionResponse,
) {}
export class CouncilVersionPage extends createZodDto(zCouncilVersionPage) {}
