import { zUserProviderResponse, zUserResponse } from '@pistis/core';

import { UserProviderMapper } from './user-provider.mapper.js';
import { UserMapper } from './user.mapper.js';

const now = new Date('2026-11-15T09:30:00.123Z');

describe('UserMapper', () => {
  const mapper = new UserMapper();

  it('creates an active user with a UUIDv7 that maps to the spec', () => {
    const entity = mapper.toEntity(
      { displayName: 'Ada', email: 'ada@example.com' },
      now,
    );

    expect(entity).toMatchObject({ status: 'active', lastSignInAt: null });
    expect(entity.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
    const response = mapper.toResponse(entity);
    expect(zUserResponse.parse(response)).toEqual(response);
  });

  it('replaces the whole profile on PUT', () => {
    const entity = mapper.applyTo(
      mapper.toEntity({ displayName: 'Ada', email: 'ada@example.com' }, now),
      { displayName: 'Ada L.', email: null },
      new Date('2026-11-16T00:00:00.000Z'),
    );

    expect(entity).toMatchObject({ displayName: 'Ada L.', email: null });
  });
});

describe('UserProviderMapper', () => {
  it('links an identity in a shape that maps to the spec', () => {
    const mapper = new UserProviderMapper();
    const entity = mapper.toEntity(
      {
        provider: 'google',
        subject: '1234',
        email: null,
        emailVerified: false,
      },
      '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
      now,
    );

    const response = mapper.toResponse(entity);
    expect(zUserProviderResponse.parse(response)).toEqual(response);
  });
});
