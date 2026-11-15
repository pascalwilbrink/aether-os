import { z } from 'zod';

/**
 * The environment variables every service verifying Pistis tokens has;
 * spread into a service's env schema (`...zAuthEnv.shape`).
 */
export const zAuthEnv = z.object({
  /** Pistis's issuer, the `iss` of its tokens; its keys are at `<issuer>/jwks`. */
  PISTIS_ISSUER: z.url(),
  /**
   * Public keys to trust instead of fetching them from Pistis (a JWKS as
   * JSON), for tests and offline development.
   */
  PISTIS_JWKS: z
    .string()
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'must be JSON' });
        return z.NEVER;
      }
    })
    .pipe(z.object({ keys: z.array(z.record(z.string(), z.unknown())).min(1) }))
    .optional(),
});
