import { z } from 'zod';

/** Polis's environment, validated at startup; see `.env.example`. */
export const zEnv = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  /** Polis's own Postgres database. */
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

export type Env = z.infer<typeof zEnv>;
