import { z } from 'zod';

import { zAuthEnv } from '@aether-os/krepis';

/** Seshat's environment, validated at startup; see `.env.example`. */
export const zEnv = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3009),
  /** Seshat's own Postgres database. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** RabbitMQ: Seshat's events go out (through the outbox). */
  RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
  /** How often the relay publishes waiting events; 0 turns it off. */
  OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(0).default(1000),
  /** Pistis, whose access tokens every request needs. */
  ...zAuthEnv.shape,
  /** Polis's API: organizations and projects (with Seshat's own token). */
  POLIS_URL: z.url({ protocol: /^https?$/ }),
  /** Loculus's API: the documents' files (with Seshat's own token). */
  LOCULUS_URL: z.url({ protocol: /^https?$/ }),
  /** How often the indexer looks for documents to index (ms); 0 turns it off. */
  INDEXER_INTERVAL_MS: z.coerce.number().int().min(0).default(2000),
  /** The largest document Seshat reads to index (bytes); larger ones fail. */
  DOCUMENT_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  /** Seshat's own client at Pistis (client credentials, `platform:read`). */
  PISTIS_CLIENT_ID: z.string().min(1).default('seshat'),
  PISTIS_CLIENT_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof zEnv>;
