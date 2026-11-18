import { zEnv } from './env.js';

const valid = {
  DATABASE_URL: 'postgres://aether:aether@localhost:5432/hephaestus',
  POLIS_URL: 'http://localhost:3001',
  RABBITMQ_URL: 'amqp://aether:aether@localhost:5672',
  PISTIS_ISSUER: 'http://localhost:3003/oidc',
  PISTIS_CLIENT_SECRET: 'hephaestus-dev-secret',
};

describe('zEnv', () => {
  it('defaults the port, environment, relay interval and runner', () => {
    expect(zEnv.parse(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      PORT: 3002,
      OUTBOX_RELAY_INTERVAL_MS: 1000,
      PISTIS_CLIENT_ID: 'hephaestus',
      // No runner unless a runtime is configured.
      AGENT_RUNTIME: 'none',
      RUNNER_POLL_INTERVAL_MS: 1000,
      RUNNER_MAX_EXECUTIONS: 4,
      RUNNER_MAX_TASKS_PER_ORGANIZATION: 10,
      RUNNER_MAX_TASKS_PER_PROJECT: 5,
      RUNNER_PROVISIONING_TIMEOUT_MS: 600_000,
      RUNNER_RUN_TIMEOUT_MS: 3_600_000,
      RUNNER_HEARTBEAT_INTERVAL_MS: 15_000,
      RUNNER_HEARTBEAT_TIMEOUT_MS: 120_000,
      RUNNER_STOP_GRACE_MS: 30_000,
      RUNNER_MAX_INFRASTRUCTURE_FAILURES: 3,
      RUNNER_RETRY_BACKOFF_MS: 10_000,
    });
    expect(zEnv.safeParse({ ...valid, AGENT_RUNTIME: 'mastra' }).success).toBe(
      false,
    );
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
