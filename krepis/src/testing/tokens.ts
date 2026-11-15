import { randomUUID } from 'node:crypto';

import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';

import type { OrganizationRole, ProjectRole } from '../auth/permissions.js';

export const TEST_ISSUER = 'https://pistis.test/oidc';

export interface UserTokenOptions {
  sub?: string;
  organizationId?: string;
  roles?: OrganizationRole[];
  projectRoles?: Record<string, ProjectRole>;
  subType?: 'user' | 'service_account';
  /** Task tokens: the one project. */
  projectId?: string;
  expiresIn?: string;
}

/**
 * Pistis-like access tokens for tests: an ES256 key generated per instance,
 * its public JWKS (`AuthModule.forRoot({ issuer: TEST_ISSUER, jwks })`), and
 * tokens shaped like Pistis's (`at+jwt`, `aud: aether-os`).
 */
export class TestTokens {
  private constructor(
    readonly jwks: { keys: Record<string, unknown>[] },
    private readonly privateKey: CryptoKey,
    readonly issuer: string,
  ) {}

  static async create(issuer = TEST_ISSUER): Promise<TestTokens> {
    const { publicKey, privateKey } = await generateKeyPair('ES256', {
      extractable: true,
    });
    const jwk = {
      ...(await exportJWK(publicKey)),
      kid: 'test-key',
      alg: 'ES256',
      use: 'sig',
    };
    return new TestTokens(
      { keys: [jwk as Record<string, unknown>] },
      privateKey,
      issuer,
    );
  }

  /** A user's (or service account's) token for one organization. */
  user(options: UserTokenOptions = {}): Promise<string> {
    return this.sign(
      {
        sub: options.sub ?? randomUUID(),
        sub_type: options.subType ?? 'user',
        ...(options.organizationId
          ? {
              org_id: options.organizationId,
              org_roles: options.roles ?? ['member'],
              project_roles: options.projectRoles ?? {},
            }
          : {}),
        ...(options.projectId ? { project_id: options.projectId } : {}),
        scope: 'api',
      },
      options.expiresIn,
    );
  }

  /** A platform service's own token with platform permissions. */
  service(sub: string, scopes: string[] = ['platform:read']): Promise<string> {
    return this.sign({ sub, sub_type: 'service', scope: scopes.join(' ') });
  }

  /** Any claims, e.g. to test what gets rejected. */
  sign(
    claims: JWTPayload,
    expiresIn = '10m',
    issuer = this.issuer,
  ): Promise<string> {
    return new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key', typ: 'at+jwt' })
      .setIssuer(issuer)
      .setAudience('aether-os')
      .setIssuedAt()
      .setJti(randomUUID())
      .setExpirationTime(expiresIn)
      .sign(this.privateKey);
  }
}
