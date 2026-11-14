import { Injectable, NotFoundException } from '@nestjs/common';

import {
  TransactionManager,
  type AgentId,
  type AgentVersionId,
  type OrganizationId,
  type Page,
  type PageRequest,
} from '@hephaestus/core';
import { OrganizationService } from '@hephaestus/organizations';

import { Agent } from '../../domain/agent.js';
import {
  AgentVersion,
  type CreateAgentVersionProps,
} from '../../domain/agent-version.js';
import { AgentArchivedError } from '../../domain/error/agent-archived.error.js';
import { AgentVersionConflictError } from '../../domain/error/agent-version-conflict.error.js';
import { AgentVersionRepository } from '../../domain/repository/agent-version.repository.js';
import { AgentRepository } from '../../domain/repository/agent.repository.js';

const MAX_VERSION_ATTEMPTS = 5;

export interface CreateAgentInput {
  id: AgentId;
  organizationId: OrganizationId;
  name: string;
  description: string;
  createdBy: string;
}

export type CreateAgentVersionInput = Omit<
  CreateAgentVersionProps,
  'version'
>;

/**
 * Reads require the organization to exist (404 otherwise); writes also
 * require it to be active (OrganizationSuspendedError otherwise).
 */
@Injectable()
export class AgentService {
  constructor(
    private readonly agentRepository: AgentRepository,
    private readonly versionRepository: AgentVersionRepository,
    private readonly organizations: OrganizationService,
    private readonly transactions: TransactionManager,
  ) {}

  async create(input: CreateAgentInput): Promise<Agent> {
    await this.organizations.findActiveById(input.organizationId);

    const agent = Agent.create(input);

    await this.agentRepository.save(agent);

    return agent;
  }

  async findById(
    organizationId: OrganizationId,
    agentId: AgentId,
  ): Promise<Agent> {
    await this.organizations.findById(organizationId);

    return this.loadAgent(organizationId, agentId);
  }

  async list(
    organizationId: OrganizationId,
    page: PageRequest,
  ): Promise<Page<Agent>> {
    await this.organizations.findById(organizationId);

    return this.agentRepository.findByOrganization(organizationId, page);
  }

  async listVersions(
    organizationId: OrganizationId,
    agentId: AgentId,
    page: PageRequest,
  ): Promise<Page<AgentVersion>> {
    await this.organizations.findById(organizationId);

    // 404 for unknown agents rather than an empty page.
    await this.loadAgent(organizationId, agentId);

    return this.versionRepository.findByAgent(organizationId, agentId, page);
  }

  async findVersionById(
    organizationId: OrganizationId,
    agentId: AgentId,
    versionId: AgentVersionId,
  ): Promise<AgentVersion> {
    await this.organizations.findById(organizationId);

    return this.loadVersion(organizationId, agentId, versionId);
  }

  async createVersion(
    input: CreateAgentVersionInput,
  ): Promise<AgentVersion> {
    await this.organizations.findActiveById(input.organizationId);

    const agent = await this.loadAgent(input.organizationId, input.agentId);

    if (agent.status !== 'active') {
      throw new AgentArchivedError(agent.id);
    }

    // Concurrent creates can pick the same number; the unique constraint
    // rejects all but one, and the losers retry with a fresh number.
    for (let attempt = 1; ; attempt++) {
      const versionNumber =
        await this.versionRepository.getNextVersionNumber(
          input.organizationId,
          input.agentId,
        );

      const version = AgentVersion.create({
        ...input,
        version: versionNumber,
      });

      try {
        await this.versionRepository.save(version);

        return version;
      } catch (error) {
        if (
          error instanceof AgentVersionConflictError &&
          attempt < MAX_VERSION_ATTEMPTS
        ) {
          continue;
        }

        throw error;
      }
    }
  }

  async publishVersion(
    organizationId: OrganizationId,
    agentId: AgentId,
    versionId: AgentVersionId,
  ): Promise<AgentVersion> {
    // The new version, the previous latest, and the agent must change
    // together or not at all.
    return this.transactions.run(async () => {
      await this.organizations.findActiveById(organizationId);

      const agent = await this.loadAgent(organizationId, agentId);
      const version = await this.loadVersion(
        organizationId,
        agentId,
        versionId,
      );

      const previous = agent.latestVersionId
        ? await this.loadVersion(
            organizationId,
            agentId,
            agent.latestVersionId,
          )
        : null;

      version.publish();
      agent.publishVersion(version.id);

      // Only one version is live at a time: retire the one being replaced.
      if (previous?.status === 'published') {
        previous.deprecate();
        await this.versionRepository.save(previous);
      }

      await this.versionRepository.save(version);
      await this.agentRepository.save(agent);

      return version;
    });
  }

  async archive(
    organizationId: OrganizationId,
    agentId: AgentId,
  ): Promise<void> {
    await this.organizations.findActiveById(organizationId);

    const agent = await this.loadAgent(organizationId, agentId);

    agent.archive();

    await this.agentRepository.save(agent);
  }

  private async loadAgent(
    organizationId: OrganizationId,
    agentId: AgentId,
  ): Promise<Agent> {
    const agent = await this.agentRepository.findById(
      organizationId,
      agentId,
    );

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    return agent;
  }

  private async loadVersion(
    organizationId: OrganizationId,
    agentId: AgentId,
    versionId: AgentVersionId,
  ): Promise<AgentVersion> {
    const version = await this.versionRepository.findById(
      organizationId,
      versionId,
    );

    if (!version || version.agentId !== agentId) {
      throw new NotFoundException('Agent version not found');
    }

    return version;
  }
}
