import { z } from 'zod';

import { zAuthEnv } from '@aether-os/krepis';

/** Agora's environment, validated at startup; see `.env.example`. */
export const zEnv = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3008),
  /** Agora's own Postgres database. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** RabbitMQ: Agora's events go out (through the outbox). */
  RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
  /** How often the relay publishes waiting events; 0 turns it off. */
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(0).default(1000),
  /** Pistis, whose access tokens every request needs. */
  ...zAuthEnv.shape,
  /** Polis's API: organizations (with Agora's own token). */
  POLIS_URL: z.url({ protocol: /^https?$/ }),
  /**
   * Hephaestus's API: whether a new version's tools and skills can be
   * chosen (with Agora's own token).
   */
  HEPHAESTUS_URL: z.url({ protocol: /^https?$/ }),
  /** Pylon's API: whether a new version's model is in its catalogue. */
  PYLON_URL: z.url({ protocol: /^https?$/ }),
  /** Agora's own client at Pistis (client credentials, `platform:read`). */
  PISTIS_CLIENT_ID: z.string().min(1).default('agora'),
  PISTIS_CLIENT_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof zEnv>;
