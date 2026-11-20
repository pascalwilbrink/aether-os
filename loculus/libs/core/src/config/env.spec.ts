import { zEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://aether:aether@localhost:5432/loculus',
  PISTIS_ISSUER: 'http://localhost:3003/oidc',
};

describe('Loculus env', () => {
  it('has defaults for the rest', () => {
    expect(zEnv.parse(base)).toMatchObject({
      PORT: 3007,
      S3_REGION: 'us-east-1',
      S3_BUCKET: 'loculus',
      S3_FORCE_PATH_STYLE: false,
      S3_CREATE_BUCKET: false,
      FILE_MAX_BYTES: 100 * 1024 * 1024,
      UPLOAD_URL_TTL_SECONDS: 900,
      DOWNLOAD_URL_TTL_SECONDS: 300,
    });
  });

  it('takes S3 credentials together or not at all', () => {
    const result = zEnv.safeParse({ ...base, S3_ACCESS_KEY_ID: 'loculus' });
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      'S3_SECRET_ACCESS_KEY',
    ]);
    expect(
      zEnv.parse({
        ...base,
        S3_ACCESS_KEY_ID: 'loculus',
        S3_SECRET_ACCESS_KEY: 'loculus-secret',
        S3_FORCE_PATH_STYLE: 'true',
      }),
    ).toMatchObject({ S3_ACCESS_KEY_ID: 'loculus', S3_FORCE_PATH_STYLE: true });
  });

  it('needs its database and Pistis', () => {
    const result = zEnv.safeParse({});
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual([
      'DATABASE_URL',
      'PISTIS_ISSUER',
    ]);
  });
});
