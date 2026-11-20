import type { ApiTypes } from '@agora/core';

/** What an agent version chooses from Hephaestus: its model, tools and skills. */
export type AgentVersionChoices = Pick<
  ApiTypes.CreateAgentVersionRequest,
  'model' | 'tools' | 'skills'
>;

/**
 * Whether a version's model, tools and skills can be chosen in an
 * organization. Hephaestus owns the model catalogue, the tool servers and
 * the skills, so it decides (`HttpAgentVersionChecker`); tests use a fake.
 * Throws `AgentVersionChoiceError` with Hephaestus's code when it refuses,
 * and `ServiceUnavailableException` when it can't be asked.
 */
export abstract class AgentVersionChecker {
  abstract assertChoosable(
    organizationId: string,
    choices: AgentVersionChoices,
  ): Promise<void>;
}
