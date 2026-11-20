import { createZodDto, zAgentVersionCheckRequest } from '@hephaestus/core';

export class AgentVersionCheckRequest extends createZodDto(
  zAgentVersionCheckRequest,
) {}
