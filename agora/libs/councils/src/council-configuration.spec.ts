import {
  configurationProblem,
  discussionOf,
  modeAllowed,
  settingsOf,
  type AgentState,
} from './council-configuration.js';
import { nextCouncilVersionStatus } from './council-transitions.js';

const agent = (
  id: string,
  overrides: Partial<AgentState> = {},
): AgentState => ({
  id,
  name: id,
  status: 'active',
  latestVersionId: `${id}-v1`,
  ...overrides,
});

describe('council configuration', () => {
  const settings = settingsOf(undefined);
  const agents = [agent('f'), agent('a'), agent('b')];
  const config = (overrides: object = {}) => ({
    facilitator: { agentId: 'f' },
    members: [
      { agentId: 'a', participation: 'required' as const },
      {
        agentId: 'b',
        participation: 'conditional' as const,
        when: 'Security questions.',
      },
    ],
    settings,
    ...overrides,
  });

  it('fills in defaults', () => {
    expect(settings).toEqual({
      defaultMode: 'facilitated',
      allowDirectInteraction: true,
      allowDiscussion: true,
      allowPlanning: true,
      allowDelegation: false,
      requireSynthesis: true,
    });
    expect(discussionOf({ maxRounds: 5 })).toEqual({
      maxRounds: 5,
      allowAgentResponses: true,
      requireFacilitatorConclusion: true,
    });
    expect(
      modeAllowed('facilitated', { ...settings, allowDiscussion: false }),
    ).toBe(true);
    expect(modeAllowed('delegation', settings)).toBe(false);
  });

  it('accepts a council of active, published agents', () => {
    expect(configurationProblem(config(), agents)).toBeNull();
  });

  it.each([
    [
      'the facilitator as a member',
      config({ members: [{ agentId: 'f', participation: 'required' }] }),
      agents,
      'is the facilitator',
    ],
    [
      'a member twice',
      config({
        members: [
          { agentId: 'a', participation: 'required' },
          { agentId: 'a', participation: 'optional' },
        ],
      }),
      agents,
      'more than once',
    ],
    [
      'a conditional member without when',
      config({ members: [{ agentId: 'b', participation: 'conditional' }] }),
      agents,
      'say when',
    ],
    ['an unknown agent', config(), [agent('f'), agent('a')], 'has no agent b'],
    [
      'an archived agent',
      config(),
      [agent('f'), agent('a'), agent('b', { status: 'archived' })],
      'is archived',
    ],
    [
      'an agent without a published version',
      config(),
      [agent('f', { latestVersionId: null }), agent('a'), agent('b')],
      'no published version',
    ],
    [
      'a default mode the settings forbid',
      config({ settings: { ...settings, defaultMode: 'delegation' } }),
      agents,
      "isn't one the settings allow",
    ],
  ])('refuses %s', (_name, value, states, problem) => {
    expect(configurationProblem(value, states)).toContain(problem);
  });

  it('moves versions like agents', () => {
    expect(nextCouncilVersionStatus('draft', 'publish')).toBe('published');
    expect(nextCouncilVersionStatus('published', 'publish')).toBe('published');
    expect(nextCouncilVersionStatus('deprecated', 'publish')).toBeNull();
    expect(nextCouncilVersionStatus('published', 'deprecate')).toBe(
      'deprecated',
    );
  });
});
