import { createZodDto, zListProjectsPath } from '@polis/core';

/** `:organizationId` (a UUID). */
export class ProjectsParams extends createZodDto(zListProjectsPath) {}
