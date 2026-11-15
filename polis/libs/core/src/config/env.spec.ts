import { zEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgres://aether:aether@localhost:5432/polis',
  RABBITMQ_URL: 'amqp://aether:aether@localhost:5672',
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

  it('requires a Postgres and an AMQP URL', () => {
    expect(zEnv.safeParse({}).success).toBe(false);
    expect(
      zEnv.safeParse({ ...valid, DATABASE_URL: 'mysql://h/db' }).success,
    ).toBe(false);
    expect(zEnv.safeParse({ ...valid, RABBITMQ_URL: 'http://h' }).success).toBe(
      false,
    );
  });
});
