import { zEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://aether:aether@localhost:5432/pistis',
  POLIS_URL: 'http://localhost:3001',
};

describe('zEnv', () => {
  it('has development defaults', () => {
    const env = zEnv.parse(base);

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3003,
      PASSWORD_SCRYPT_COST: 17,
      PISTIS_ISSUER: 'http://localhost:3003/oidc',
      ACCESS_TOKEN_TTL_SECONDS: 600,
    });
    expect(env.PISTIS_CLIENTS.map((client) => client.client_id)).toEqual([
      'iris',
    ]);
    expect(env.PISTIS_SIGNING_KEYS).toBeUndefined();
  });

  it('parses keys and clients from JSON', () => {
    const env = zEnv.parse({
      ...base,
      PISTIS_SIGNING_KEYS: JSON.stringify({ keys: [{ kty: 'EC', kid: 'k1' }] }),
      PISTIS_COOKIE_KEYS: `${'a'.repeat(32)}, ${'b'.repeat(32)}`,
      PISTIS_CLIENTS: JSON.stringify([
        {
          client_id: 'cli',
          grant_types: ['authorization_code'],
          token_endpoint_auth_method: 'none',
        },
      ]),
    });

    expect(env.PISTIS_COOKIE_KEYS).toHaveLength(2);
    expect(env.PISTIS_CLIENTS[0]).toMatchObject({
      client_id: 'cli',
      redirect_uris: [],
    });
  });

  it('requires keys and clients in production', () => {
    const result = zEnv.safeParse({ ...base, NODE_ENV: 'production' });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual([
      'PISTIS_CLIENTS',
      'PISTIS_COOKIE_KEYS',
      'PISTIS_SIGNING_KEYS',
    ]);
  });

  it('keeps access tokens short-lived', () => {
    expect(
      zEnv.safeParse({ ...base, ACCESS_TOKEN_TTL_SECONDS: '3600' }).success,
    ).toBe(false);
  });
});
