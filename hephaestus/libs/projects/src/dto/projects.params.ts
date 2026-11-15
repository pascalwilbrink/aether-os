import { createZodDto, zListProjectsPath } from '@hephaestus/core';

/** `:organizationId` (a UUID). */
export class ProjectsParams extends createZodDto(zListProjectsPath) {}
