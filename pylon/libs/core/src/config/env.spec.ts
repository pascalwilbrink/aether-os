import { zEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://aether:aether@localhost:5432/pylon',
  RABBITMQ_URL: 'amqp://aether:aether@localhost:5672',
  PISTIS_ISSUER: 'http://localhost:3003/oidc',
  PISTIS_CLIENT_SECRET: 'pylon-dev-secret',
  POLIS_URL: 'http://localhost:3001',
};

describe('Pylon env', () => {
  it('has defaults for the rest', () => {
    expect(zEnv.parse(base)).toMatchObject({
      PORT: 3011,
      PISTIS_CLIENT_ID: 'pylon',
      OUTBOX_RELAY_INTERVAL_MS: 1000,
      OPENBAO_KV_MOUNT: 'secret',
      PLATFORM_MODEL_KEYS: false,
      MODEL_ENDPOINT_ALLOW_PRIVATE: false,
      ANTHROPIC_API_URL: 'https://api.anthropic.com',
      OPENAI_API_URL: 'https://api.openai.com',
      PROVIDER_RETRIES: 2,
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
