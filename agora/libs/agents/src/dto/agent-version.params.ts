import { createZodDto, zGetAgentVersionPath } from '@agora/core';

/** `:organizationId`, `:agentId` and `:versionId` (UUIDs). */
export class AgentVersionParams extends createZodDto(zGetAgentVersionPath) {}
