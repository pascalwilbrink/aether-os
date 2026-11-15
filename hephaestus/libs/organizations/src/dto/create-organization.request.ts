import { createZodDto, zCreateOrganizationRequest } from '@hephaestus/core';

export class CreateOrganizationRequest extends createZodDto(
  zCreateOrganizationRequest,
) {}
