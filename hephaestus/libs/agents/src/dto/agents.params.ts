import { createZodDto, zCheckAgentVersionPath } from '@hephaestus/core';

/** `:organizationId` (a UUID). */
export class AgentsParams extends createZodDto(zCheckAgentVersionPath) {}
