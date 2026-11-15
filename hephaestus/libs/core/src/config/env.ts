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
});

export type Env = z.infer<typeof zEnv>;
