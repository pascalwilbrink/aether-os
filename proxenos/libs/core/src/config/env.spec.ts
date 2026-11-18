import { zEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgres://aether:aether@localhost:5432/proxenos',
  RABBITMQ_URL: 'amqp://aether:aether@localhost:5672',
  PISTIS_ISSUER: 'http://localhost:3003/oidc',
  PISTIS_CLIENT_SECRET: 'proxenos-dev-secret',
  POLIS_URL: 'http://localhost:3001',
};

describe('Proxenos env', () => {
  it('runs without GitHub, with defaults', () => {
    const env = zEnv.parse(base);
    expect(env).toMatchObject({
      PORT: 3004,
      PISTIS_CLIENT_ID: 'proxenos',
      IRIS_URL: 'http://localhost:3000',
      GITHUB_URL: 'https://github.com',
      GITHUB_API_URL: 'https://api.github.com',
      GITHUB_APP_SECRET_PATH: 'platform/github-app',
    });
    expect(env.GITHUB_APP_ID).toBeUndefined();
  });

  it('needs the rest of the app, and OpenBao, with GITHUB_APP_ID', () => {
    const result = zEnv.safeParse({ ...base, GITHUB_APP_ID: '123' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0]).sort()).toEqual([
      'GITHUB_APP_SLUG',
      'GITHUB_CLIENT_ID',
      'OPENBAO_ADDR',
      'OPENBAO_TOKEN',
    ]);
    expect(
      zEnv.safeParse({
        ...base,
        GITHUB_APP_ID: '123',
        GITHUB_APP_SLUG: 'aether-os',
        GITHUB_CLIENT_ID: 'Iv1.abc',
        OPENBAO_ADDR: 'http://localhost:8200',
        OPENBAO_TOKEN: 'dev-root-token',
      }).success,
    ).toBe(true);
  });
});
