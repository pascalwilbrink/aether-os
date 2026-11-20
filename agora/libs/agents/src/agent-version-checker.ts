import type { ApiTypes } from '@agora/core';

/** What an agent version chooses: its model (Pylon's), tools and skills (Hephaestus's). */
export type AgentVersionChoices = Pick<
  ApiTypes.CreateAgentVersionRequest,
  'model' | 'tools' | 'skills'
>;

/**
 * Whether a version's model, tools and skills can be chosen in an
 * organization. Pylon owns the model catalogue and Hephaestus the tool
 * servers and skills, so they decide (`HttpAgentVersionChecker`); tests use
 * a fake. Throws `AgentVersionChoiceError` with their code when one refuses,
 * and `ServiceUnavailableException` when one can't be asked.
 */
export abstract class AgentVersionChecker {
  abstract assertChoosable(
    organizationId: string,
    choices: AgentVersionChoices,
  ): Promise<void>;
}
