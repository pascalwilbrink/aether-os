import { zEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://aether:aether@localhost:5432/kerykes',
  RABBITMQ_URL: 'amqp://aether:aether@localhost:5672',
  PISTIS_ISSUER: 'http://localhost:3003/oidc',
  PISTIS_CLIENT_SECRET: 'kerykes-dev-secret',
  POLIS_URL: 'http://localhost:3001',
};

describe('Kerykes env', () => {
  it('has defaults for the rest', () => {
    expect(zEnv.parse(base)).toMatchObject({
      PORT: 3006,
      PISTIS_CLIENT_ID: 'kerykes',
      OUTBOX_RELAY_INTERVAL_MS: 1000,
      IRIS_URL: 'http://localhost:3000',
      EMAIL_DRIVER: 'none',
      EMAIL_POLL_INTERVAL_MS: 5000,
      EMAIL_MAX_ATTEMPTS: 5,
      EMAIL_RETRY_BACKOFF_MS: 30_000,
    });
  });

  it('needs an SMTP server to send email', () => {
    const result = zEnv.safeParse({ ...base, EMAIL_DRIVER: 'smtp' });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      'SMTP_URL',
    ]);
    expect(
      zEnv.parse({
        ...base,
        EMAIL_DRIVER: 'smtp',
        SMTP_URL: 'smtp://localhost:1025',
      }).SMTP_URL,
    ).toBe('smtp://localhost:1025');
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
