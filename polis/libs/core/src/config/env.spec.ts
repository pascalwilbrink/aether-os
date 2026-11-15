import { zEnv } from './env.js';

describe('zEnv', () => {
  it('defaults the port and environment', () => {
    expect(
      zEnv.parse({
        DATABASE_URL: 'postgres://aether:aether@localhost:5432/polis',
      }),
    ).toEqual({
      NODE_ENV: 'development',
      PORT: 3001,
      DATABASE_URL: 'postgres://aether:aether@localhost:5432/polis',
    });
  });

  it('requires a Postgres URL', () => {
    expect(zEnv.safeParse({}).success).toBe(false);
    expect(zEnv.safeParse({ DATABASE_URL: 'mysql://h/db' }).success).toBe(
      false,
    );
  });
});
