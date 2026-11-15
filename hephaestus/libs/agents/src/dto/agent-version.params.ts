import { createZodDto, zGetAgentVersionPath } from '@hephaestus/core';

/** `:organizationId`, `:agentId` and `:versionId` (UUIDs). */
export class AgentVersionParams extends createZodDto(zGetAgentVersionPath) {}
