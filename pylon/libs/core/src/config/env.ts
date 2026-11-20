import { z } from 'zod';

import { zAuthEnv } from '@aether-os/krepis';

/** Pylon's environment, validated at startup; see `.env.example`. */
export const zEnv = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3011),
  /** Pylon's own Postgres database. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** RabbitMQ: Pylon's events go out (through the outbox), Agora's come in. */
  RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
  /** How often the relay publishes waiting events; 0 turns it off. */
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(0).default(1000),
  /** Pistis, whose access tokens every request needs. */
  ...zAuthEnv.shape,
  /** Polis's API: organizations and projects (with Pylon's own token). */
  POLIS_URL: z.url({ protocol: /^https?$/ }),
  /**
   * OpenBao, where provider keys are (`orgs/<organizationId>/llm/<provider>`,
   * an agent's under `…/agents/<agentId>/llm/<provider>`, the platform's at
   * `platform/llm/<provider>`). Without it, no key can be set or used.
   */
  OPENBAO_ADDR: z.url({ protocol: /^https?$/ }).optional(),
  OPENBAO_TOKEN: z.string().min(1).optional(),
  /** The KV version 2 engine holding them. */
  OPENBAO_KV_MOUNT: z.string().min(1).default('secret'),
  /**
   * Whether organizations without their own key for a provider may use the
   * platform's: off unless plans allow it.
   */
  PLATFORM_MODEL_KEYS: z.stringbool().default(false),
  /**
   * Model endpoints organizations run (Ollama's `baseUrl`): whether Pylon
   * may call private, loopback and link-local addresses, and over
   * `http://` (an Ollama next to Pylon, locally). Off in production.
   */
  MODEL_ENDPOINT_ALLOW_PRIVATE: z.stringbool().default(false),
  /**
   * The hosted providers' APIs (tests point them at fakes; also for a
   * regional endpoint or a proxy).
   */
  ANTHROPIC_API_URL: z
    .url({ protocol: /^https?$/ })
    .default('https://api.anthropic.com'),
  OPENAI_API_URL: z
    .url({ protocol: /^https?$/ })
    .default('https://api.openai.com'),
  MISTRAL_API_URL: z
    .url({ protocol: /^https?$/ })
    .default('https://api.mistral.ai'),
  GOOGLE_API_URL: z
    .url({ protocol: /^https?$/ })
    .default('https://generativelanguage.googleapis.com'),
  /**
   * How often Pylon tries a provider again after a `429`, a `5xx` or no
   * answer, before the first byte reached the caller (the caller's SDK
   * shouldn't retry as well).
   */
  PROVIDER_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  /** The longest Pylon waits for a provider's answer to start (ms). */
  PROVIDER_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
  /** The largest request Pylon passes on to a provider (bytes). */
  PROVIDER_MAX_REQUEST_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(20 * 1024 * 1024),
  /** Pylon's own client at Pistis (client credentials, `platform:read`). */
  PISTIS_CLIENT_ID: z.string().min(1).default('pylon'),
  PISTIS_CLIENT_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof zEnv>;
