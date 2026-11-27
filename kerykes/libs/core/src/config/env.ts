import { z } from 'zod';

import { zAuthEnv } from '@aether-os/krepis';

/** Kerykes's environment, validated at startup; see `.env.example`. */
export const zEnv = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3006),
    /** Kerykes's own Postgres database. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** RabbitMQ: Polis's and Hephaestus's events come in. */
    RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
    /** How often the outbox relay runs (Kerykes publishes nothing yet); 0 turns it off. */
    OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(0).default(1000),
    /** Pistis, whose access tokens every request needs. */
    ...zAuthEnv.shape,
    /** Polis's API: memberships and projects (with Kerykes's own token). */
    POLIS_URL: z.url({ protocol: /^https?$/ }),
    /** Ergon's API: a work item's reviewers (with Kerykes's own token). */
    ERGON_URL: z.url({ protocol: /^https?$/ }),
    /** Pistis's API (users' email addresses); its issuer's origin by default. */
    PISTIS_URL: z.url({ protocol: /^https?$/ }).optional(),
    /** Kerykes's own client at Pistis (client credentials, `platform:read`). */
    PISTIS_CLIENT_ID: z.string().min(1).default('kerykes'),
    PISTIS_CLIENT_SECRET: z.string().min(16),
    /** Iris, which emails link to. */
    IRIS_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:3000'),
    /**
     * `none`: no email (in-app only; deliveries are recorded as skipped);
     * `smtp`: through `SMTP_URL` (Mailpit locally; Resend and SES accept
     * SMTP too).
     */
    EMAIL_DRIVER: z.enum(['none', 'smtp']).default('none'),
    SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
    /** The sender, e.g. `Aether-os <notifications@example.com>`. */
    EMAIL_FROM: z
      .string()
      .min(3)
      .default('Aether-os <notifications@aether-os.local>'),
    /** How often waiting emails are sent; 0 turns sending off. */
    EMAIL_POLL_INTERVAL_MS: z.coerce.number().int().min(0).default(5000),
    /** Tries per email before it's given up as failed. */
    EMAIL_MAX_ATTEMPTS: z.coerce.number().int().min(1).default(5),
    /** The wait after a failed try, doubled each time. */
    EMAIL_RETRY_BACKOFF_MS: z.coerce.number().int().min(0).default(30_000),
  })
  .refine((env) => env.EMAIL_DRIVER !== 'smtp' || env.SMTP_URL, {
    message: 'SMTP_URL is required with EMAIL_DRIVER=smtp',
    path: ['SMTP_URL'],
  });

export type Env = z.infer<typeof zEnv>;
