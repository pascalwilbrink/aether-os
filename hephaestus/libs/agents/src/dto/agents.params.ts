import { createZodDto, zListAgentsPath } from '@hephaestus/core';

/** `:organizationId` (a UUID). */
export class AgentsParams extends createZodDto(zListAgentsPath) {}
