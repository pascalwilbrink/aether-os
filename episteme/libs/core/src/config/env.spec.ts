import { zEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://aether:aether@localhost:5432/episteme',
  RABBITMQ_URL: 'amqp://aether:aether@localhost:5672',
  PISTIS_ISSUER: 'http://localhost:3003/oidc',
  POLIS_URL: 'http://localhost:3001',
  PISTIS_CLIENT_SECRET: 'episteme-dev-secret',
};

describe('Episteme env', () => {
  it('has defaults for the rest', () => {
    expect(zEnv.parse(base)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3014,
      OUTBOX_RELAY_INTERVAL_MS: 1000,
      PISTIS_CLIENT_ID: 'episteme',
    });
  });

  it('needs its database, RabbitMQ, Pistis and Polis', () => {
    const result = zEnv.safeParse({});
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual([
      'DATABASE_URL',
      'PISTIS_CLIENT_SECRET',
      'PISTIS_ISSUER',
      'POLIS_URL',
      'RABBITMQ_URL',
    ]);
  });
});
