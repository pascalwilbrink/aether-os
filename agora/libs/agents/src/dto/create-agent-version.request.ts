import { createZodDto, zCreateAgentVersionRequest } from '@agora/core';

export class CreateAgentVersionRequest extends createZodDto(
  zCreateAgentVersionRequest,
) {}
