import { z } from 'zod';

import { zAuthEnv } from '@aether-os/krepis';

/** Proxenos's environment, validated at startup; see `.env.example`. */
export const zEnv = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3004),
    /** Proxenos's own Postgres database. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** RabbitMQ, where the outbox relay publishes Proxenos's events. */
    RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
    /** How often the relay publishes waiting events; 0 turns it off. */
    OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(0).default(1000),
    /** Pistis, whose access tokens every request needs. */
    ...zAuthEnv.shape,
    /** Polis's API: organizations and projects (with Proxenos's own token). */
    POLIS_URL: z.url({ protocol: /^https?$/ }),
    /** Proxenos's own client at Pistis (client credentials, `platform:read`). */
    PISTIS_CLIENT_ID: z.string().min(1).default('proxenos'),
    PISTIS_CLIENT_SECRET: z.string().min(16),
    /** Where people are sent back to after connecting GitHub. */
    IRIS_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),

    /**
     * The GitHub App (docs/git.md). Without `GITHUB_APP_ID` GitHub isn't
     * configured: connecting, syncing, tokens and webhooks answer 503.
     */
    GITHUB_APP_ID: z
      .string()
      .regex(/^[0-9]+$/)
      .optional(),
    /** The app's URL name, for its installation page. */
    GITHUB_APP_SLUG: z.string().min(1).optional(),
    /** The app's OAuth client ID, to check who installed it. */
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    /** github.com, or a GitHub Enterprise Server. */
    GITHUB_URL: z.url({ protocol: /^https?$/ }).default('https://github.com'),
    GITHUB_API_URL: z
      .url({ protocol: /^https?$/ })
      .default('https://api.github.com'),
    /**
     * The OpenBao path of the app's secrets (`privateKey`, `clientSecret`,
     * `webhookSecret`), a platform secret only Proxenos reads.
     */
    GITHUB_APP_SECRET_PATH: z.string().min(1).default('platform/github-app'),
    OPENBAO_ADDR: z.url({ protocol: /^https?$/ }).optional(),
    OPENBAO_TOKEN: z.string().min(1).optional(),
    OPENBAO_KV_MOUNT: z.string().min(1).default('secret'),
  })
  .superRefine((env, ctx) => {
    if (!env.GITHUB_APP_ID) {
      return;
    }
    for (const key of [
      'GITHUB_APP_SLUG',
      'GITHUB_CLIENT_ID',
      'OPENBAO_ADDR',
      'OPENBAO_TOKEN',
    ] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'is required with GITHUB_APP_ID',
        });
      }
    }
  });

export type Env = z.infer<typeof zEnv>;
