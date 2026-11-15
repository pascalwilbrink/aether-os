import { zEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgres://aether:aether@localhost:5432/hephaestus',
  POLIS_URL: 'http://localhost:3001',
  RABBITMQ_URL: 'amqp://aether:aether@localhost:5672',
};

describe('zEnv', () => {
  it('defaults the port, environment and relay interval', () => {
    expect(zEnv.parse(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      PORT: 3002,
      OUTBOX_RELAY_INTERVAL_MS: 1000,
    });
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
