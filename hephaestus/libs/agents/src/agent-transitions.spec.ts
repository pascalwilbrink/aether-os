import {
  nextAgentStatus,
  nextAgentVersionStatus,
  type AgentVersionAction,
  type AgentVersionStatus,
} from './agent-transitions.js';

describe('agent transitions', () => {
  it('archives once, idempotently', () => {
    expect(nextAgentStatus('active', 'archive')).toBe('archived');
    expect(nextAgentStatus('archived', 'archive')).toBe('archived');
  });

  // Every (status, action) pair of the version lifecycle.
  it.each<[AgentVersionStatus, AgentVersionAction, AgentVersionStatus | null]>([
    ['draft', 'publish', 'published'],
    ['published', 'publish', 'published'],
    ['deprecated', 'publish', null],
    ['draft', 'deprecate', null],
    ['published', 'deprecate', 'deprecated'],
    ['deprecated', 'deprecate', null],
  ])('version %s --%s--> %s', (current, action, next) => {
    expect(nextAgentVersionStatus(current, action)).toBe(next);
  });
});
