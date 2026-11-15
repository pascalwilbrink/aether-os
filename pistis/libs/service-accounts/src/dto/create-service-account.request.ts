import { createZodDto, zCreateServiceAccountRequest } from '@pistis/core';

export class CreateServiceAccountRequest extends createZodDto(
  zCreateServiceAccountRequest,
) {}
