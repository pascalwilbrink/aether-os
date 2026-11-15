import { createZodDto, zCreateAgentVersionRequest } from '@hephaestus/core';

export class CreateAgentVersionRequest extends createZodDto(
  zCreateAgentVersionRequest,
) {}
