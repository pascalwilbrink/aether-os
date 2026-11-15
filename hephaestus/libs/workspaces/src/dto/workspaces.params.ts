import { createZodDto, zListWorkspacesPath } from '@hephaestus/core';

/** `:organizationId` (a UUID). */
export class WorkspacesParams extends createZodDto(zListWorkspacesPath) {}
