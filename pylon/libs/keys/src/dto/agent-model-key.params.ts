import {
  createZodDto,
  zDeleteAgentModelKeyPath,
  zListAgentModelKeysPath,
} from '@pylon/core';

/** `:organizationId` and `:agentId`. */
export class AgentModelKeysParams extends createZodDto(
  zListAgentModelKeysPath,
) {}

/** `:organizationId`, `:agentId` and `:provider`. */
export class AgentModelKeyParams extends createZodDto(
  zDeleteAgentModelKeyPath,
) {}
