import { createZodDto, zSetSessionModeRequest } from '@hephaestus/core';

export class SetSessionModeRequest extends createZodDto(
  zSetSessionModeRequest,
) {}
