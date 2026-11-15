import { createZodDto, zGetProjectPath } from '@polis/core';

/** `:organizationId` and `:projectId` (UUIDs). */
export class ProjectParams extends createZodDto(zGetProjectPath) {}
