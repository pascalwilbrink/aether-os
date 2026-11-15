import { createZodDto, zCreateWorkspaceRequest } from '@hephaestus/core';

export class CreateWorkspaceRequest extends createZodDto(
  zCreateWorkspaceRequest,
) {}
