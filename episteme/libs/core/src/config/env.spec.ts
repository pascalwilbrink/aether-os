import { zEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://aether:aether@localhost:5432/episteme',
  RABBITMQ_URL: 'amqp://aether:aether@localhost:5672',
  PISTIS_ISSUER: 'http://localhost:3003/oidc',
};

describe('Episteme env', () => {
  it('has defaults for the rest', () => {
    expect(zEnv.parse(base)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3014,
      OUTBOX_RELAY_INTERVAL_MS: 1000,
    });
  });

  it('needs its database, RabbitMQ and Pistis', () => {
    const result = zEnv.safeParse({});
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual([
      'DATABASE_URL',
      'PISTIS_ISSUER',
      'RABBITMQ_URL',
    ]);
  });
});
