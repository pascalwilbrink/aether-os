import { createZodDto, zCreateOrganizationRequest } from '@polis/core';

export class CreateOrganizationRequest extends createZodDto(
  zCreateOrganizationRequest,
) {}
