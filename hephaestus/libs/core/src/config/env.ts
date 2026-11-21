import { z } from 'zod';

import { zAuthEnv } from '@aether-os/krepis';

/** Hephaestus's environment, validated at startup; see `.env.example`. */
export const zEnv = z.object({
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
   * with Mastra, their model calls through Pylon; `echo` is a stand-in that
   * finishes every task at once without a model, for local development.
   */
  AGENT_RUNTIME: z.enum(['none', 'mastra', 'echo']).default('none'),
  /**
   * OpenBao (secrets: tool servers' credentials at
   * `orgs/<organizationId>/tool-servers/<id>`); without it none can be set.
   */
  OPENBAO_ADDR: z.url({ protocol: /^https?$/ }).optional(),
  OPENBAO_TOKEN: z.string().min(1).optional(),
  /** The KV version 2 engine holding them. */
  OPENBAO_KV_MOUNT: z.string().min(1).default('secret'),
  /**
   * Pylon, the model gateway (../docs/pylon.md): agents' model calls go
   * through it with the task token, and it keeps the catalogue, keys,
   * metering and budgets.
   */
  PYLON_URL: z.url({ protocol: /^https?$/ }),
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
  /** Review rounds a task may have before its drafts must be approved or rejected. */
  REVIEW_MAX_ROUNDS: z.coerce.number().int().min(1).max(20).default(3),
  /** Runs of the agent per execution while acceptance criteria fail. */
  VERIFICATION_MAX_ROUNDS: z.coerce.number().int().min(1).max(10).default(3),
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
  /**
   * Hosts every `restricted` sandbox may reach through its proxy, besides
   * its agent version's own (comma-separated; `*.example.com` for
   * subdomains): the package registries.
   */
  SANDBOX_ALLOWED_HOSTS: z
    .string()
    .default(
      'registry.npmjs.org,registry.yarnpkg.com,pypi.org,files.pythonhosted.org,proxy.golang.org,sum.golang.org,index.crates.io,static.crates.io,repo.maven.apache.org,repo1.maven.org,rubygems.org',
    )
    .transform((value) =>
      value
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    ),
  /**
   * Tool servers (MCP, libs/tools): whether Hephaestus may connect to
   * private, loopback and link-local addresses, and over `http://` (local
   * development, a tool server next to Hephaestus). Off in production.
   */
  TOOL_SERVER_ALLOW_PRIVATE: z.stringbool().default(false),
  /**
   * Origins (`https://seshat.example.com`) whose tool servers may be sent
   * a task's own token (`auth.type: task-token`): Aether-os's own servers
   * only (comma-separated).
   */
  TOOL_SERVER_TRUSTED_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, '').toLowerCase())
        .filter(Boolean),
    ),
  /** How long one tool call (or connecting to a tool server) may take. */
  TOOL_CALL_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  /** The image of a `restricted` sandbox's proxy; anything with `node`. */
  SANDBOX_PROXY_IMAGE: z.string().min(1).default('node:22-alpine'),
  /** The Docker network the proxy reaches the internet on. */
  SANDBOX_EGRESS_NETWORK: z.string().min(1).default('bridge'),
  SANDBOX_WORKSPACE_MB: z.coerce.number().int().min(16).default(1024),
  /**
   * Proxenos's API (docs/git.md): repository tokens for tasks that work in
   * a repository. Without it such tasks fail.
   */
  PROXENOS_URL: z.url({ protocol: /^https?$/ }).optional(),
  /**
   * Loculus's API (docs/files.md): where files agents submit from their
   * sandboxes are kept. Without it agents have no `submit_file`.
   */
  LOCULUS_URL: z.url({ protocol: /^https?$/ }).optional(),
  /** The largest file a task starts from, or an agent submits from its sandbox. */
  TASK_FILE_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(25 * 1024 * 1024),
});

export type Env = z.infer<typeof zEnv>;
