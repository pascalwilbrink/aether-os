import { createZodDto, zGetProjectPath } from '@hephaestus/core';

/** `:organizationId` and `:projectId` (UUIDs). */
export class ProjectParams extends createZodDto(zGetProjectPath) {}
