import {
  createZodDto,
  zCreateSkillRequest,
  zCreateSkillVersionRequest,
  zGetSkillPath,
  zGetSkillVersionPath,
  zListSkillsPath,
  zListSkillsQuery,
  zListSkillVersionsQuery,
  zSkillPage,
  zSkillResponse,
  zSkillVersionPage,
  zSkillVersionResponse,
} from '@agora/core';

export class CreateSkillRequest extends createZodDto(zCreateSkillRequest) {}
export class CreateSkillVersionRequest extends createZodDto(
  zCreateSkillVersionRequest,
) {}
export class SkillResponse extends createZodDto(zSkillResponse) {}
export class SkillPage extends createZodDto(zSkillPage) {}
export class SkillVersionResponse extends createZodDto(zSkillVersionResponse) {}
export class SkillVersionPage extends createZodDto(zSkillVersionPage) {}

/** `:organizationId`. */
export class SkillsParams extends createZodDto(zListSkillsPath) {}
/** `?status=&limit=&cursor=`. */
export class ListSkillsQuery extends createZodDto(zListSkillsQuery) {}
/** `:organizationId` and `:skillId`. */
export class SkillParams extends createZodDto(zGetSkillPath) {}
/** `?limit=&cursor=`. */
export class ListSkillVersionsQuery extends createZodDto(
  zListSkillVersionsQuery,
) {}
/** `:organizationId`, `:skillId` and `:version`. */
export class SkillVersionParams extends createZodDto(zGetSkillVersionPath) {}
