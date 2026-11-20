import { zEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://aether:aether@localhost:5432/seshat',
  RABBITMQ_URL: 'amqp://aether:aether@localhost:5672',
  PISTIS_ISSUER: 'http://localhost:3003/oidc',
  PISTIS_CLIENT_SECRET: 'seshat-dev-secret',
  POLIS_URL: 'http://localhost:3001',
  LOCULUS_URL: 'http://localhost:3007',
};

describe('Seshat env', () => {
  it('has defaults for the rest', () => {
    expect(zEnv.parse(base)).toMatchObject({
      PORT: 3009,
      PISTIS_CLIENT_ID: 'seshat',
      OUTBOX_RELAY_INTERVAL_MS: 1000,
    });
  });

  it('needs its database, RabbitMQ, Pistis, Polis and Loculus', () => {
    const result = zEnv.safeParse({});
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual([
      'DATABASE_URL',
      'LOCULUS_URL',
      'PISTIS_CLIENT_SECRET',
      'PISTIS_ISSUER',
      'POLIS_URL',
      'RABBITMQ_URL',
    ]);
  });
});
