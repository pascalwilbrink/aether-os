import { zEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://aether:aether@localhost:5432/agora',
  RABBITMQ_URL: 'amqp://aether:aether@localhost:5672',
  PISTIS_ISSUER: 'http://localhost:3003/oidc',
  PISTIS_CLIENT_SECRET: 'agora-dev-secret',
  POLIS_URL: 'http://localhost:3001',
  HEPHAESTUS_URL: 'http://localhost:3002',
  PYLON_URL: 'http://localhost:3011',
};

describe('Agora env', () => {
  it('has defaults for the rest', () => {
    expect(zEnv.parse(base)).toMatchObject({
      PORT: 3008,
      PISTIS_CLIENT_ID: 'agora',
      OUTBOX_RELAY_INTERVAL_MS: 1000,
    });
  });

  it('needs its database, RabbitMQ, Pistis, Polis, Hephaestus and Pylon', () => {
    const result = zEnv.safeParse({});
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual([
      'DATABASE_URL',
      'HEPHAESTUS_URL',
      'PISTIS_CLIENT_SECRET',
      'PISTIS_ISSUER',
      'POLIS_URL',
      'PYLON_URL',
      'RABBITMQ_URL',
    ]);
  });
});
