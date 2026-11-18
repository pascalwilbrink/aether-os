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
      REVIEW_MAX_ROUNDS: 3,
      VERIFICATION_MAX_ROUNDS: 3,
      OPENBAO_KV_MOUNT: 'secret',
      PLATFORM_MODEL_KEYS: false,
      SANDBOX_DRIVER: 'none',
      SANDBOX_IMAGE: 'node:22-slim',
      SANDBOX_USER: '1000:1000',
      SANDBOX_CPUS: 1,
      SANDBOX_MEMORY_MB: 2048,
      SANDBOX_PIDS_LIMIT: 256,
      SANDBOX_WORKSPACE_MB: 1024,
    });
    expect(zEnv.safeParse({ ...valid, AGENT_RUNTIME: 'other' }).success).toBe(
      false,
    );
  });

  it('requires OpenBao for the Mastra runtime (model keys)', () => {
    expect(zEnv.safeParse({ ...valid, AGENT_RUNTIME: 'mastra' }).success).toBe(
      false,
    );
    expect(
      zEnv.parse({
        ...valid,
        AGENT_RUNTIME: 'mastra',
        OPENBAO_ADDR: 'http://localhost:8200',
        OPENBAO_TOKEN: 'dev-root-token',
        PLATFORM_MODEL_KEYS: 'true',
      }),
    ).toMatchObject({ AGENT_RUNTIME: 'mastra', PLATFORM_MODEL_KEYS: true });
  });

  it('never runs sandboxes as root', () => {
    for (const user of ['0', '0:0', 'root', '1000:0x', '']) {
      expect(zEnv.safeParse({ ...valid, SANDBOX_USER: user }).success).toBe(
        false,
      );
    }
    expect(zEnv.parse({ ...valid, SANDBOX_USER: '1001' }).SANDBOX_USER).toBe(
      '1001',
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
