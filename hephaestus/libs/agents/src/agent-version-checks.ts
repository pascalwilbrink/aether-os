import { Injectable } from '@nestjs/common';

import type { ApiTypes } from '@hephaestus/core';
import { ModelCatalogService } from '@hephaestus/models';
import { SkillsService } from '@hephaestus/skills';
import { ToolServerInvalidError, ToolServersService } from '@hephaestus/tools';

/** What an agent version chooses from Hephaestus: its model, tools and skills. */
export type AgentVersionChoices = Pick<
  ApiTypes.CreateAgentVersionRequest,
  'model' | 'tools' | 'skills'
>;

/**
 * Whether an agent version's model, tools and skills can be chosen in an
 * organization: Hephaestus owns the model catalogue, the tool servers and
 * the skills, so Agora asks here (`POST …/agent-version-checks`) before it
 * creates a version. Throws the same 409s as creating one.
 */
@Injectable()
export class AgentVersionChecks {
  constructor(
    private readonly models: ModelCatalogService,
    private readonly toolServers: ToolServersService,
    private readonly skills: SkillsService,
  ) {}

  async assertChoosable(
    organizationId: string,
    choices: AgentVersionChoices,
  ): Promise<void> {
    await this.models.assertAvailable(
      choices.model.provider,
      choices.model.model,
    );
    await this.assertTools(organizationId, choices.tools);
    await this.skills.assertChoosable(organizationId, choices.skills);
  }

  /**
   * Each tool server at most once, and an enabled one must exist (a
   * disabled entry may name one that doesn't, yet or any more).
   */
  private async assertTools(
    organizationId: string,
    tools: AgentVersionChoices['tools'],
  ): Promise<void> {
    const names = tools.map((tool) => tool.name);
    const repeated = names.filter((name, i) => names.indexOf(name) !== i);
    if (repeated.length > 0) {
      throw new ToolServerInvalidError(
        `Tool server ${repeated[0]} is listed more than once in tools.`,
      );
    }
    const unknown = await this.toolServers.unknownNames(
      organizationId,
      tools.filter((tool) => tool.enabled).map((tool) => tool.name),
    );
    if (unknown.length > 0) {
      throw new ToolServerInvalidError(
        `The organization has no tool server named ${unknown.join(', ')}.`,
      );
    }
  }
}
