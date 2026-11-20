import { ServiceUnavailableException } from '@nestjs/common';

import { AgentVersionChecker, type AgentVersionChoices } from '@agora/agents';
import { AgentVersionChoiceError } from '@agora/agents';

/**
 * Hephaestus's check of a version's choices, as each test sets it up: it
 * knows some models, tool servers and skills, and can be down.
 */
export class FakeHephaestus extends AgentVersionChecker {
  readonly models = new Set(['anthropic/claude']);
  readonly toolServers = new Set<string>();
  readonly skills = new Set<string>();
  down = false;
  readonly checked: { organizationId: string; choices: AgentVersionChoices }[] =
    [];

  assertChoosable(
    organizationId: string,
    choices: AgentVersionChoices,
  ): Promise<void> {
    this.checked.push({ organizationId, choices });
    if (this.down) {
      return Promise.reject(new ServiceUnavailableException('down'));
    }
    const { provider, model } = choices.model;
    if (!this.models.has(`${provider}/${model}`)) {
      return Promise.reject(
        new AgentVersionChoiceError(
          `Model ${provider}/${model} isn't available.`,
          'MODEL_NOT_AVAILABLE',
        ),
      );
    }
    const tool = choices.tools.find(
      (entry) => entry.enabled && !this.toolServers.has(entry.name),
    );
    if (tool) {
      return Promise.reject(
        new AgentVersionChoiceError(
          `The organization has no tool server named ${tool.name}.`,
          'TOOL_SERVER_INVALID',
        ),
      );
    }
    const skill = choices.skills.find(
      (entry) => entry.enabled && !this.skills.has(entry.name),
    );
    if (skill) {
      return Promise.reject(
        new AgentVersionChoiceError(
          `The organization has no skill named ${skill.name}.`,
          'SKILL_INVALID',
        ),
      );
    }
    return Promise.resolve();
  }
}
