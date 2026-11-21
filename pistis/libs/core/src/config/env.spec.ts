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
    // Iris; Hephaestus, Proxenos, Kairos, Kerykes, Agora and Seshat as platform services; operators.
    expect(env.PISTIS_CLIENTS.map((client) => client.client_id)).toEqual([
      'iris',
      'hephaestus',
      'proxenos',
      'kairos',
      'kerykes',
      'agora',
      'seshat',
      'pylon',
      'operator',
    ]);
    expect(env.PISTIS_SIGNING_KEYS).toBeUndefined();
  });

  it("lets Iris sign in on its own port and on `pnpm start:dev`'s", () => {
    const iris = zEnv
      .parse(base)
      .PISTIS_CLIENTS.find((client) => client.client_id === 'iris');

    expect(iris?.redirect_uris).toEqual([
      'http://localhost:3000/auth/callback',
      'http://localhost:3010/auth/callback',
    ]);
    expect(iris?.post_logout_redirect_uris).toEqual([
      'http://localhost:3000/',
      'http://localhost:3010/',
    ]);
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

  it('parses upstream providers', () => {
    const env = zEnv.parse({
      ...base,
      PISTIS_UPSTREAM_PROVIDERS: JSON.stringify([
        {
          id: 'entra:contoso',
          name: 'Contoso',
          issuer: 'https://login.example.com/v2.0',
          clientId: 'c1',
        },
      ]),
    });
    expect(env.PISTIS_UPSTREAM_PROVIDERS).toEqual([
      {
        id: 'entra:contoso',
        name: 'Contoso',
        issuer: 'https://login.example.com/v2.0',
        clientId: 'c1',
        scopes: 'openid email profile',
      },
    ]);
    expect(zEnv.parse(base).PISTIS_UPSTREAM_PROVIDERS).toEqual([]);
  });

  it('rejects reserved, duplicate and (in production) insecure providers', () => {
    const provider = {
      id: 'google',
      name: 'Google',
      issuer: 'http://idp.local',
      clientId: 'c',
    };
    const parse = (providers: object[], env: object = {}) =>
      zEnv.safeParse({
        ...base,
        ...env,
        PISTIS_UPSTREAM_PROVIDERS: JSON.stringify(providers),
      }).success;

    expect(parse([provider])).toBe(true);
    expect(parse([{ ...provider, id: 'password' }])).toBe(false);
    expect(parse([{ ...provider, id: 'Google' }])).toBe(false);
    expect(parse([provider, provider])).toBe(false);
    expect(
      zEnv
        .safeParse({
          ...base,
          NODE_ENV: 'production',
          PISTIS_SIGNING_KEYS: JSON.stringify({ keys: [{ kty: 'EC' }] }),
          PISTIS_COOKIE_KEYS: 'a'.repeat(32),
          PISTIS_CLIENTS: '[]',
          PISTIS_UPSTREAM_PROVIDERS: JSON.stringify([provider]),
        })
        .error?.issues.map((issue) => issue.path.join('.')),
    ).toEqual(['PISTIS_UPSTREAM_PROVIDERS.0.issuer']);
  });
});
