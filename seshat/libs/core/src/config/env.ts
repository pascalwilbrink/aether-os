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
  /**
   * Pylon's API (the model gateway, ../docs/pylon.md): passages and queries
   * are embedded there with Seshat's own token (`model:invoke`), charged to
   * the project. Without it, search is by keyword only.
   */
  PYLON_URL: z.url({ protocol: /^https?$/ }).optional(),
  /**
   * The embedding model, `<provider>/<model>` of Pylon's catalogue. Every
   * vector of a project comes from it; changing it embeds everything again.
   */
  EMBEDDING_MODEL: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]*\/[a-zA-Z0-9][a-zA-Z0-9._:-]*$/)
    .default('openai/text-embedding-3-small'),
  /** How often the embedder looks for passages to embed (ms); 0 turns it off. */
  EMBEDDER_INTERVAL_MS: z.coerce.number().int().min(0).default(2000),
  /**
   * The least cosine similarity a passage needs to be a semantic match
   * (vectors always have a nearest neighbour, related or not).
   */
  SEARCH_MIN_SIMILARITY: z.coerce.number().min(-1).max(1).default(0.3),
  /**
   * Proxenos's API: the files of repositories linked to projects (with
   * Seshat's own token), indexed as repository documents. Without it,
   * repositories are recorded but not read.
   */
  PROXENOS_URL: z.url({ protocol: /^https?$/ }).optional(),
  /** How often repositories waiting to be read are looked for (ms); 0 turns it off. */
  REPOSITORY_SYNC_INTERVAL_MS: z.coerce.number().int().min(0).default(5000),
  /** What a newly linked repository indexes: folders (ending in `/`) and files, comma-separated. */
  REPOSITORY_DEFAULT_PATHS: z
    .string()
    .default('docs/,specs/,adr/,README.md')
    .transform((value) =>
      value
        .split(',')
        .map((path) => path.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string()).min(1).max(20)),
  /** The most documents indexed from one repository; files past it are skipped. */
  REPOSITORY_MAX_DOCUMENTS: z.coerce.number().int().positive().default(500),
  /** The largest document Seshat reads to index (bytes); larger ones fail. */
  DOCUMENT_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),
  /**
   * Seshat's own client at Pistis (client credentials, `platform:read`, and
   * `model:invoke` with Pylon).
   */
  PISTIS_CLIENT_ID: z.string().min(1).default('seshat'),
  PISTIS_CLIENT_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof zEnv>;
