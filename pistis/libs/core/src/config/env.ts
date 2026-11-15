import { z } from 'zod';

const json = <T extends z.ZodType>(schema: T) =>
  z
    .string()
    .transform((value, ctx) => {
      try {
        return JSON.parse(value) as unknown;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'must be JSON' });
        return z.NEVER;
      }
    })
    .pipe(schema);

/** An OAuth client of Pistis: Iris, a CLI, a service (client credentials). */
const zClient = z
  .object({
    client_id: z.string().min(1),
    client_secret: z.string().min(16).optional(),
    redirect_uris: z.array(z.url()).default([]),
    post_logout_redirect_uris: z.array(z.url()).optional(),
    grant_types: z.array(
      z.enum(['authorization_code', 'refresh_token', 'client_credentials']),
    ),
    token_endpoint_auth_method: z.enum([
      'none',
      'client_secret_basic',
      'client_secret_post',
    ]),
  })
  .loose();

/**
 * An external OpenID Connect provider people can sign in with (Entra ID,
 * Auth0, Google, Keycloak, …). `id` is the identity's `provider` in
 * `user_providers`, so it must never change once people signed in with it.
 */
export const zUpstreamProvider = z.object({
  id: z
    .string()
    .regex(
      /^[a-z0-9][a-z0-9:._-]{0,63}$/,
      'lowercase letters, digits, ":", ".", "_" and "-"',
    )
    .refine((id) => id !== 'password', 'is reserved for passwords'),
  /** Shown on the sign-in button: "Sign in with <name>". */
  name: z.string().min(1).max(64),
  /** The issuer; its `/.well-known/openid-configuration` is discovered. */
  issuer: z.url({ protocol: /^https?$/ }),
  clientId: z.string().min(1),
  /** Absent for a public client (PKCE only). */
  clientSecret: z.string().min(1).optional(),
  scopes: z.string().default('openid email profile'),
});
export type UpstreamProviderConfig = z.infer<typeof zUpstreamProvider>;

/** Iris on localhost, for development. */
const DEV_CLIENTS = [
  {
    client_id: 'iris',
    redirect_uris: ['http://localhost:3000/auth/callback'],
    post_logout_redirect_uris: ['http://localhost:3000/'],
    grant_types: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_method: 'none',
  },
];

/** Pistis's environment, validated at startup; see `.env.example`. */
export const zEnv = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3003),
    /** Pistis's own Postgres database. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /**
     * scrypt cost for new password hashes, as log2(N): 17 is OWASP's
     * recommendation (N = 131072, 128 MiB). Stored with each hash, so raising
     * it later doesn't break existing passwords.
     */
    PASSWORD_SCRYPT_COST: z.coerce.number().int().min(14).max(20).default(17),
    /** The OIDC issuer: Pistis's public URL plus `/oidc`; the `iss` of every token. */
    PISTIS_ISSUER: z.url().default('http://localhost:3003/oidc'),
    /**
     * Private signing keys, a JWKS (`{"keys":[…]}`, ES256 or RS256, each with a
     * `kid`); the first signs, all are published, so keys rotate by adding one
     * in front. Required in production; generated per start otherwise.
     */
    PISTIS_SIGNING_KEYS: json(
      z.object({ keys: z.array(z.record(z.string(), z.unknown())).min(1) }),
    ).optional(),
    /** Keys for Pistis's session cookies, comma-separated; required in production. */
    PISTIS_COOKIE_KEYS: z
      .string()
      .transform((value) =>
        value
          .split(',')
          .map((key) => key.trim())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().min(32)).min(1))
      .optional(),
    /** OAuth clients as a JSON array; defaults to Iris on localhost outside production. */
    PISTIS_CLIENTS: json(z.array(zClient)).optional(),
    /** Access token lifetime: 5–15 minutes (docs/identity.md). */
    ACCESS_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(900)
      .default(600),
    /** External OpenID Connect providers to sign in with, as a JSON array (none by default). */
    PISTIS_UPSTREAM_PROVIDERS: json(z.array(zUpstreamProvider))
      .optional()
      .transform((providers) => providers ?? [])
      .refine(
        (providers) =>
          new Set(providers.map((provider) => provider.id)).size ===
          providers.length,
        'provider ids must be unique',
      ),
    /** Polis's API: memberships and organization status for organization tokens. */
    POLIS_URL: z.url({ protocol: /^https?$/ }),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') {
      return;
    }
    env.PISTIS_UPSTREAM_PROVIDERS.forEach((provider, index) => {
      if (!provider.issuer.startsWith('https:')) {
        ctx.addIssue({
          code: 'custom',
          path: ['PISTIS_UPSTREAM_PROVIDERS', index, 'issuer'],
          message: 'must be https in production',
        });
      }
    });
    for (const key of [
      'PISTIS_SIGNING_KEYS',
      'PISTIS_COOKIE_KEYS',
      'PISTIS_CLIENTS',
    ] as const) {
      if (!env[key]) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'is required in production',
        });
      }
    }
  })
  .transform((env) => ({
    ...env,
    PISTIS_CLIENTS: env.PISTIS_CLIENTS ?? DEV_CLIENTS,
  }));

export type Env = z.infer<typeof zEnv>;
