import { zAgentResponse, zAgentVersionResponse } from '@hephaestus/core';

import { AgentVersionMapper } from './agent-version.mapper.js';
import { AgentMapper } from './agent.mapper.js';

const organizationId = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const now = new Date('2026-11-15T09:30:00.123Z');

describe('AgentMapper', () => {
  const mapper = new AgentMapper();

  it('creates an active agent without a published version', () => {
    const entity = mapper.toEntity(
      { name: 'Helper', description: 'Helps' },
      organizationId,
      'user-1',
      now,
    );

    expect(entity).toMatchObject({
      organizationId,
      status: 'active',
      latestVersionId: null,
      createdAt: now,
    });
    expect(entity.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    expect(zAgentResponse.parse(mapper.toResponse(entity))).toEqual(
      mapper.toResponse(entity),
    );
  });
});

describe('AgentVersionMapper', () => {
  const mapper = new AgentVersionMapper();

  it('creates a numbered draft that maps to the spec', () => {
    const entity = mapper.toEntity(
      {
        instructions: 'Be helpful.',
        model: { provider: 'anthropic', model: 'claude', temperature: 0.2 },
        capabilities: ['chat'],
        tools: [{ name: 'search', enabled: true, tools: ['query'] }],
        skills: [{ name: 'summarize', version: '1.0.0', enabled: true }],
        runtime: {
          provider: 'local',
          executionMode: 'standard',
          sandboxRequired: false,
        },
      },
      { organizationId, agentId: '0193a1b2-c3d4-7e5f-8a9b-000000000001' },
      3,
      'user-1',
      now,
    );

    expect(entity).toMatchObject({
      version: 3,
      status: 'draft',
      publishedAt: null,
    });
    const response = mapper.toResponse(entity);
    expect(zAgentVersionResponse.parse(response)).toEqual(response);
  });
});
