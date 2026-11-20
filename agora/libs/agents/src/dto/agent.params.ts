import { createZodDto, zGetAgentPath } from '@agora/core';

/** `:organizationId` and `:agentId` (UUIDs). */
export class AgentParams extends createZodDto(zGetAgentPath) {}
