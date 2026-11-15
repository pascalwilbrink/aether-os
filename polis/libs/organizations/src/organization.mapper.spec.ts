import { zOrganizationResponse } from '@polis/core';

import { OrganizationMapper } from './organization.mapper.js';

describe('OrganizationMapper', () => {
  const mapper = new OrganizationMapper();
  const now = new Date('2026-11-15T09:30:00.123Z');
  const dto = { name: 'Acme', slug: 'acme', createdBy: 'user-1' };

  it('creates an active organization with a UUIDv7', () => {
    const entity = mapper.toEntity(dto, now);

    expect(entity).toMatchObject({
      ...dto,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    expect(entity.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(mapper.toEntity(dto, now).id).not.toBe(entity.id);
  });

  it('maps to a response that matches the spec', () => {
    const response = mapper.toResponse(mapper.toEntity(dto, now));

    expect(zOrganizationResponse.parse(response)).toEqual(response);
    expect(response.createdAt).toBe('2026-11-15T09:30:00.123Z');
  });
});
