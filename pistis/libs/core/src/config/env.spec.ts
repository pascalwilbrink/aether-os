import { zEnv } from './env.js';

describe('zEnv', () => {
  it('defaults the port and environment', () => {
    const DATABASE_URL = 'postgres://aether:aether@localhost:5432/pistis';

    expect(zEnv.parse({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      PORT: 3003,
      DATABASE_URL,
    });
  });

  it('requires a Postgres URL', () => {
    expect(zEnv.safeParse({}).success).toBe(false);
    expect(zEnv.safeParse({ DATABASE_URL: 'mysql://h/db' }).success).toBe(
      false,
    );
  });
});
