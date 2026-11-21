import type { ApiTypes } from '@agora/core';

/** What an agent version chooses elsewhere: its model (Pylon's) and tools (Hephaestus's). */
export type AgentVersionChoices = Pick<
  ApiTypes.CreateAgentVersionRequest,
  'model' | 'tools'
>;

/**
 * Whether a version's model and tools can be chosen in an organization.
 * Pylon owns the model catalogue and Hephaestus the tool servers, so they
 * decide (`HttpAgentVersionChecker`); tests use a fake. Its skills are
 * Agora's own (`SkillsService.assertChoosable`). Throws `AgentVersionChoiceError` with their code when one refuses,
 * and `ServiceUnavailableException` when one can't be asked.
 */
export abstract class AgentVersionChecker {
  abstract assertChoosable(
    organizationId: string,
    choices: AgentVersionChoices,
  ): Promise<void>;
}
