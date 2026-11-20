import { z } from 'zod';

import { zAuthEnv } from '@aether-os/krepis';

const MIB = 1024 * 1024;

/** Loculus's environment, validated at startup; see `.env.example`. */
export const zEnv = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(3007),
    /** Loculus's own Postgres database: the files' metadata. */
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    /** Pistis, whose access tokens every request needs. */
    ...zAuthEnv.shape,
    /**
     * The S3 API Loculus itself calls (checking and deleting objects); leave
     * out for AWS S3 (the region's endpoint).
     */
    S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
    /**
     * The S3 API clients reach with signed URLs (signatures include the
     * host); `S3_ENDPOINT` by default.
     */
    S3_PUBLIC_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
    S3_REGION: z.string().min(1).default('us-east-1'),
    /** The one bucket for Aether-os's files. */
    S3_BUCKET: z.string().min(3).max(63).default('loculus'),
    /** Leave both out to use the SDK's default credentials (an IAM role). */
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    /** `true` for most S3-compatible stores (RustFS, MinIO): `<endpoint>/<bucket>/<key>`. */
    S3_FORCE_PATH_STYLE: z.stringbool().default(false),
    /** Create the bucket at startup if it's missing (local development). */
    S3_CREATE_BUCKET: z.stringbool().default(false),
    /** The largest file Loculus accepts. */
    FILE_MAX_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(100 * MIB),
    /** How long an upload URL works. */
    UPLOAD_URL_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(7 * 24 * 3600)
      .default(900),
    /** How long a download URL works. */
    DOWNLOAD_URL_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(10)
      .max(7 * 24 * 3600)
      .default(300),
  })
  .refine((env) => !env.S3_ACCESS_KEY_ID === !env.S3_SECRET_ACCESS_KEY, {
    message: 'S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY go together',
    path: ['S3_SECRET_ACCESS_KEY'],
  });

export type Env = z.infer<typeof zEnv>;
