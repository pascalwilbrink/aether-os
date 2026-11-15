import { createZodDto, zGetWorkspacePath } from '@hephaestus/core';

/** `:organizationId` and `:workspaceId` (UUIDs). */
export class WorkspaceParams extends createZodDto(zGetWorkspacePath) {}
