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
      z.enum([
        'authorization_code',
        'refresh_token',
        'client_credentials',
        'urn:ietf:params:oauth:grant-type:token-exchange',
      ]),
    ),
    /** Platform services only: what they may exchange for (`task-token`: Hephaestus). */
    token_exchange: z.array(z.enum(['task-token', 'session-token'])).optional(),
    /** Platform services only: the platform permissions they may ask for. */
    platform_permissions: z
      .array(z.enum(['platform:read', 'platform:manage']))
      .optional(),
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

/**
 * Where Iris runs locally: its own default port, and the one `pnpm
 * start:dev` at the root gives it (`IRIS_PORT`, 3010 by default).
 */
const DEV_IRIS_ORIGINS = ['http://localhost:3000', 'http://localhost:3010'];

/** Where Atlas, the management UI, runs locally (`ATLAS_PORT` defaults to it too). */
const DEV_ATLAS_ORIGINS = ['http://localhost:3012'];

/** Iris and Atlas on localhost, for development. */
const DEV_CLIENTS = [
  {
    client_id: 'iris',
    redirect_uris: DEV_IRIS_ORIGINS.map((origin) => `${origin}/auth/callback`),
    post_logout_redirect_uris: DEV_IRIS_ORIGINS.map((origin) => `${origin}/`),
    grant_types: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_method: 'none',
  },
  {
    client_id: 'atlas',
    redirect_uris: DEV_ATLAS_ORIGINS.map((origin) => `${origin}/auth/callback`),
    post_logout_redirect_uris: DEV_ATLAS_ORIGINS.map((origin) => `${origin}/`),
    grant_types: ['authorization_code', 'refresh_token'],
    token_endpoint_auth_method: 'none',
  },
  // Hephaestus's own token (client credentials), to read from Polis.
  {
    client_id: 'hephaestus',
    client_secret: 'hephaestus-dev-secret',
    redirect_uris: [],
    response_types: [],
    grant_types: [
      'client_credentials',
      'urn:ietf:params:oauth:grant-type:token-exchange',
    ],
    token_endpoint_auth_method: 'client_secret_basic',
    platform_permissions: ['platform:read'],
    // Task tokens for the service accounts tasks run as.
    token_exchange: ['task-token', 'session-token'],
  },
  // Proxenos's own token (client credentials), to read from Polis.
  {
    client_id: 'proxenos',
    client_secret: 'proxenos-dev-secret',
    redirect_uris: [],
    response_types: [],
    grant_types: ['client_credentials'],
    token_endpoint_auth_method: 'client_secret_basic',
    platform_permissions: ['platform:read'],
  },
  // Kairos's own token (client credentials), to read from Polis.
  {
    client_id: 'kairos',
    client_secret: 'kairos-dev-secret',
    redirect_uris: [],
    response_types: [],
    grant_types: ['client_credentials'],
    token_endpoint_auth_method: 'client_secret_basic',
    platform_permissions: ['platform:read'],
  },
  // Kerykes's own token (client credentials): memberships from Polis,
  // recipients' email addresses from Pistis.
  {
    client_id: 'kerykes',
    client_secret: 'kerykes-dev-secret',
    redirect_uris: [],
    response_types: [],
    grant_types: ['client_credentials'],
    token_endpoint_auth_method: 'client_secret_basic',
    platform_permissions: ['platform:read'],
  },
  // Agora's own token (client credentials): organizations from Polis, and
  // Hephaestus's check of a new agent version.
  {
    client_id: 'agora',
    client_secret: 'agora-dev-secret',
    redirect_uris: [],
    response_types: [],
    grant_types: ['client_credentials'],
    token_endpoint_auth_method: 'client_secret_basic',
    platform_permissions: ['platform:read'],
  },
  // Seshat's own token (client credentials): projects from Polis, and the
  // documents' files from Loculus.
  {
    client_id: 'seshat',
    client_secret: 'seshat-dev-secret',
    redirect_uris: [],
    response_types: [],
    grant_types: ['client_credentials'],
    token_endpoint_auth_method: 'client_secret_basic',
    // model:invoke: embeddings through Pylon, charged to the project.
    platform_permissions: ['platform:read', 'model:invoke'],
  },
  // Pylon's own token (client credentials): organizations and projects
  // from Polis.
  {
    client_id: 'pylon',
    client_secret: 'pylon-dev-secret',
    redirect_uris: [],
    response_types: [],
    grant_types: ['client_credentials'],
    token_endpoint_auth_method: 'client_secret_basic',
    platform_permissions: ['platform:read'],
  },
  // Operator tooling for local development: create users, suspend
  // organizations (README: "Creating a user").
  {
    client_id: 'operator',
    client_secret: 'operator-dev-secret',
    redirect_uris: [],
    response_types: [],
    grant_types: ['client_credentials'],
    token_endpoint_auth_method: 'client_secret_basic',
    platform_permissions: ['platform:read', 'platform:manage'],
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
    /** RabbitMQ, where Pistis's events (`user.created`) go, through the outbox. */
    RABBITMQ_URL: z.url({ protocol: /^amqps?$/ }),
    /** How often the relay publishes waiting events; 0 turns it off. */
    OUTBOX_RELAY_INTERVAL_MS: z.coerce.number().int().min(0).default(1000),
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
