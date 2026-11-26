import { z } from 'zod';

import { zAuthEnv } from '@aether-os/krepis';

/** Ergon's environment, validated at startup; see `.env.example`. */
export const zEnv = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3013),
  /** Ergon's own Postgres database. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** RabbitMQ: Polis's and Agora's events come in, Ergon's go out (through the outbox). */
  RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
  /** How often the relay publishes waiting events; 0 turns it off. */
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(0).default(1000),
  /** Pistis, whose access tokens every request needs. */
  ...zAuthEnv.shape,
  /** Polis's API: organizations and projects (with Ergon's own token). */
  POLIS_URL: z.url({ protocol: /^https?$/ }),
  /** Ergon's own client at Pistis (client credentials, `platform:read`). */
  PISTIS_CLIENT_ID: z.string().min(1).default('ergon'),
  PISTIS_CLIENT_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof zEnv>;
