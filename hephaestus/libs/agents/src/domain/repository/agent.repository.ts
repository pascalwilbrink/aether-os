import type {
  AgentId,
  OrganizationId,
  Page,
  PageRequest,
} from '@hephaestus/core';

import type { Agent } from '../agent.js';

export abstract class AgentRepository {
  abstract save(agent: Agent): Promise<void>;

  abstract findById(
    organizationId: OrganizationId,
    agentId: AgentId,
  ): Promise<Agent | null>;

  /** Newest first. */
  abstract findByOrganization(
    organizationId: OrganizationId,
    page: PageRequest,
  ): Promise<Page<Agent>>;
}
