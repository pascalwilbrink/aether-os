import { zProjectResponse } from '@polis/core';

import { ProjectMapper } from './project.mapper.js';

describe('ProjectMapper', () => {
  const mapper = new ProjectMapper();
  const now = new Date('2026-11-15T09:30:00.123Z');
  const organizationId = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
  const dto = {
    name: 'App',
    slug: 'app',
    description: 'The main app',
    createdBy: 'user-1',
  };

  it('creates an active project in the organization', () => {
    const entity = mapper.toEntity(dto, organizationId, dto.createdBy, now);

    expect(entity).toMatchObject({
      ...dto,
      organizationId,
      status: 'active',
      createdAt: now,
    });
    expect(entity.id).toMatch(/^[0-9a-f-]{14}7/);
  });

  it('maps to a response that matches the spec', () => {
    const response = mapper.toResponse(
      mapper.toEntity(dto, organizationId, dto.createdBy, now),
    );

    expect(zProjectResponse.parse(response)).toEqual(response);
  });
});
