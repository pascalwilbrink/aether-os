import { zMembershipResponse } from '@polis/core';

import { MembershipMapper } from './membership.mapper.js';

describe('MembershipMapper', () => {
  const mapper = new MembershipMapper();
  const organizationId = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
  const created = new Date('2026-11-15T09:30:00.000Z');
  const dto = {
    subjectType: 'user' as const,
    subject: 'pistis|user-1',
    roles: ['member' as const, 'admin' as const, 'member' as const],
    createdBy: 'user-0',
  };

  it('creates a membership with normalized roles', () => {
    const entity = mapper.toEntity(dto, organizationId, dto.createdBy, created);

    expect(entity).toMatchObject({
      organizationId,
      subjectType: 'user',
      subject: 'pistis|user-1',
      roles: ['admin', 'member'],
      createdAt: created,
      updatedAt: created,
    });
    expect(entity.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
  });

  it('replaces the roles on update and maps to the spec', () => {
    const later = new Date('2026-11-16T09:30:00.000Z');
    const entity = mapper.applyTo(
      mapper.toEntity(dto, organizationId, dto.createdBy, created),
      { roles: ['viewer'] },
      later,
    );

    expect(entity).toMatchObject({ roles: ['viewer'], updatedAt: later });
    const response = mapper.toResponse(entity);
    expect(zMembershipResponse.parse(response)).toEqual(response);
  });
});
