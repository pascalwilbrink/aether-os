import { Injectable } from '@nestjs/common';

import type { ApiTypes } from '@hephaestus/core';
import { ToolServerInvalidError, ToolServersService } from '@hephaestus/tools';

/** What an agent version chooses from Hephaestus: its tools. */
export type AgentVersionChoices = ApiTypes.AgentVersionCheckRequest;

/**
 * Whether an agent version's tools can be chosen in an organization:
 * Hephaestus owns the tool servers, so Agora asks here
 * (`POST …/agent-version-checks`) before it creates a version (its model it
 * checks with Pylon's catalogue, its skills itself). Throws the same 409s
 * as creating one.
 */
@Injectable()
export class AgentVersionChecks {
  constructor(private readonly toolServers: ToolServersService) {}

  async assertChoosable(
    organizationId: string,
    choices: AgentVersionChoices,
  ): Promise<void> {
    await this.assertTools(organizationId, choices.tools);
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
