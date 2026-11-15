import { zEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgres://aether:aether@localhost:5432/polis',
  RABBITMQ_URL: 'amqp://aether:aether@localhost:5672',
  PISTIS_ISSUER: 'http://localhost:3003/oidc',
};

describe('zEnv', () => {
  it('defaults the port, environment and relay interval', () => {
    expect(zEnv.parse(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      PORT: 3001,
      OUTBOX_RELAY_INTERVAL_MS: 1000,
    });
  });

  it('reads trusted keys as a JWKS', () => {
    const jwks = { keys: [{ kty: 'EC', kid: 'k1' }] };
    expect(
      zEnv.parse({ ...valid, PISTIS_JWKS: JSON.stringify(jwks) }).PISTIS_JWKS,
    ).toEqual(jwks);
    expect(zEnv.safeParse({ ...valid, PISTIS_JWKS: '{' }).success).toBe(false);
  });

  it('requires a Postgres and an AMQP URL, and Pistis', () => {
    expect(zEnv.safeParse({ ...valid, PISTIS_ISSUER: undefined }).success).toBe(
      false,
    );
    expect(zEnv.safeParse({}).success).toBe(false);
    expect(
      zEnv.safeParse({ ...valid, DATABASE_URL: 'mysql://h/db' }).success,
    ).toBe(false);
    expect(zEnv.safeParse({ ...valid, RABBITMQ_URL: 'http://h' }).success).toBe(
      false,
    );
  });
});
