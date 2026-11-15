import { createZodDto, zChangePasswordRequest } from '@pistis/core';

export class ChangePasswordRequest extends createZodDto(
  zChangePasswordRequest,
) {}
