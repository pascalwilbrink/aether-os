import { createZodDto, zGetAgentPath } from '@hephaestus/core';

/** `:organizationId` and `:agentId` (UUIDs). */
export class AgentParams extends createZodDto(zGetAgentPath) {}
