import { createZodDto, zPasswordIdentityRequest } from '@pistis/core';

export class PasswordIdentityRequest extends createZodDto(
  zPasswordIdentityRequest,
) {}
