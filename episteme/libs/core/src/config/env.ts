import { z } from 'zod';

import { zAuthEnv } from '@aether-os/krepis';

/** Episteme's environment, validated at startup; see `.env.example`. */
export const zEnv = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3014),
  /** Episteme's own Postgres database. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** RabbitMQ: Episteme's events go out through the outbox. */
  RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
  /** How often the relay publishes waiting events; 0 turns it off. */
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(0).default(1000),
  /** Pistis, whose access tokens every request needs. */
  ...zAuthEnv.shape,
});

export type Env = z.infer<typeof zEnv>;
