import { createZodDto, zListAgentsPath } from '@agora/core';

/** `:organizationId` (a UUID). */
export class AgentsParams extends createZodDto(zListAgentsPath) {}
