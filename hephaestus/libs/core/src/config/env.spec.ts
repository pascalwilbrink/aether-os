import { zEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgres://aether:aether@localhost:5432/hephaestus',
  POLIS_URL: 'http://localhost:3001',
  RABBITMQ_URL: 'amqp://aether:aether@localhost:5672',
  PISTIS_ISSUER: 'http://localhost:3003/oidc',
  PISTIS_CLIENT_SECRET: 'hephaestus-dev-secret',
};

describe('zEnv', () => {
  it('defaults the port, environment and relay interval', () => {
    expect(zEnv.parse(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      PORT: 3002,
      OUTBOX_RELAY_INTERVAL_MS: 1000,
      PISTIS_CLIENT_ID: 'hephaestus',
    });
  });

  it("requires Pistis and Hephaestus's client secret at Pistis", () => {
    expect(zEnv.safeParse({ ...valid, PISTIS_ISSUER: undefined }).success).toBe(
      false,
    );
    expect(
      zEnv.safeParse({ ...valid, PISTIS_CLIENT_SECRET: 'short' }).success,
    ).toBe(false);
  });

  it('requires Postgres, Polis and RabbitMQ URLs', () => {
    expect(zEnv.safeParse({}).success).toBe(false);
    expect(zEnv.safeParse({ ...valid, POLIS_URL: 'ftp://polis' }).success).toBe(
      false,
    );
    expect(zEnv.safeParse({ ...valid, RABBITMQ_URL: 'http://h' }).success).toBe(
      false,
    );
  });
});
