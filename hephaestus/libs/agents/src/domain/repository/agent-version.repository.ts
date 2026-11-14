import type {
  AgentId,
  AgentVersionId,
  OrganizationId,
  Page,
  PageRequest,
} from '@hephaestus/core';

import type { AgentVersion } from '../agent-version.js';

export abstract class AgentVersionRepository {
  abstract save(version: AgentVersion): Promise<void>;

  abstract findById(
    organizationId: OrganizationId,
    versionId: AgentVersionId,
  ): Promise<AgentVersion | null>;

  /** Highest version number first. */
  abstract findByAgent(
    organizationId: OrganizationId,
    agentId: AgentId,
    page: PageRequest,
  ): Promise<Page<AgentVersion>>;

  abstract getNextVersionNumber(
    organizationId: OrganizationId,
    agentId: AgentId,
  ): Promise<number>;
}
