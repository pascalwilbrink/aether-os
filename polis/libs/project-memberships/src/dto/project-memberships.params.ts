import { createZodDto, zListProjectMembershipsPath } from '@polis/core';

export class ProjectMembershipsParams extends createZodDto(
  zListProjectMembershipsPath,
) {}
