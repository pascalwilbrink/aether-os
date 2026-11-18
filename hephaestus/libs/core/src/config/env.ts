import { z } from 'zod';

import { zAuthEnv } from '@aether-os/krepis';

/** Hephaestus's environment, validated at startup; see `.env.example`. */
export const zEnv = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3002),
    /** Hephaestus's own Postgres database. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Polis's API, asked about organizations and projects Hephaestus hasn't seen yet. */
    POLIS_URL: z.url({ protocol: /^https?$/ }),
    /** RabbitMQ: Polis's events arrive here (queue `hephaestus.polis-events`). */
    RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
    /** How often the outbox relay runs; 0 turns it off. */
    OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(0).default(1000),
    /** Pistis, whose access tokens every request needs. */
    ...zAuthEnv.shape,
    /**
     * Hephaestus's own client at Pistis (client credentials), for its calls to
     * Polis with `platform:read`.
     */
    PISTIS_CLIENT_ID: z.string().min(1).default('hephaestus'),
    PISTIS_CLIENT_SECRET: z.string().min(16),
    /**
     * The runner (libs/runner): which agent runtime runs tasks. `none` (the
     * default) starts no runner, so tasks stay queued; `mastra` runs agents
     * with Mastra through the model gateway; `echo` is a stand-in that
     * finishes every task at once without a model, for local development.
     */
    AGENT_RUNTIME: z.enum(['none', 'mastra', 'echo']).default('none'),
    /**
     * OpenBao (secrets, e.g. model provider keys at
     * `orgs/<organizationId>/llm/<provider>`): required with `mastra`.
     */
    OPENBAO_ADDR: z.url({ protocol: /^https?$/ }).optional(),
    OPENBAO_TOKEN: z.string().min(1).optional(),
    /** The KV version 2 engine holding them. */
    OPENBAO_KV_MOUNT: z.string().min(1).default('secret'),
    /**
     * Whether organizations without their own key for a provider may use the
     * platform's (`platform/llm/<provider>`): off unless plans allow it.
     */
    PLATFORM_MODEL_KEYS: z.stringbool().default(false),
    /** How often the runner looks for queued tasks and stale executions. */
    RUNNER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
    /** Executions one Hephaestus instance runs at once. */
    RUNNER_MAX_EXECUTIONS: z.coerce.number().int().positive().default(4),
    /** Running tasks per organization and per project (docs/tasks.md, Concurrency). */
    RUNNER_MAX_TASKS_PER_ORGANIZATION: z.coerce
      .number()
      .int()
      .positive()
      .default(10),
    RUNNER_MAX_TASKS_PER_PROJECT: z.coerce.number().int().positive().default(5),
    /** docs/tasks.md, Timeouts. */
    RUNNER_PROVISIONING_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(10 * 60_000),
    RUNNER_RUN_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60_000),
    RUNNER_HEARTBEAT_INTERVAL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(15_000),
    RUNNER_HEARTBEAT_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(2 * 60_000),
    /** How long a stopped execution gets to save its state (docs/tasks.md, Cancellation). */
    RUNNER_STOP_GRACE_MS: z.coerce.number().int().min(0).default(30_000),
    /** Executions per attempt after infrastructure failures (docs/tasks.md, Retries). */
    RUNNER_MAX_INFRASTRUCTURE_FAILURES: z.coerce
      .number()
      .int()
      .positive()
      .default(3),
    /** The first retry's delay; doubled for each one after it. */
    RUNNER_RETRY_BACKOFF_MS: z.coerce.number().int().min(0).default(10_000),
    /**
     * Sandboxes for agent versions that need one (`runtime.sandboxRequired`):
     * `none` (the default) fails such tasks; `docker` runs hardened containers
     * on the local Docker engine (`DOCKER_HOST`, else its socket).
     */
    SANDBOX_DRIVER: z.enum(['none', 'docker']).default('none'),
    /** The image sandboxes run; it needs a shell (`sh`). */
    SANDBOX_IMAGE: z.string().min(1).default('node:22-slim'),
    /** `uid[:gid]` sandboxes run as: never root. */
    SANDBOX_USER: z
      .string()
      .regex(/^[1-9]\d*(:[1-9]\d*)?$/, 'a non-root uid[:gid]')
      .default('1000:1000'),
    SANDBOX_CPUS: z.coerce.number().positive().max(64).default(1),
    SANDBOX_MEMORY_MB: z.coerce.number().int().min(64).default(2048),
    SANDBOX_PIDS_LIMIT: z.coerce.number().int().min(16).default(256),
    /** Size of the writable working directory, /workspace (a tmpfs). */
    SANDBOX_WORKSPACE_MB: z.coerce.number().int().min(16).default(1024),
  })
  .superRefine((env, ctx) => {
    if (env.AGENT_RUNTIME === 'mastra') {
      for (const key of ['OPENBAO_ADDR', 'OPENBAO_TOKEN'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: 'custom',
            path: [key],
            message: `${key} is required with AGENT_RUNTIME=mastra (model keys live in OpenBao)`,
          });
        }
      }
    }
  });

export type Env = z.infer<typeof zEnv>;
