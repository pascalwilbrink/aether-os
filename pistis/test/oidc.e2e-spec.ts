import { createHash, randomBytes } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import {
  createLocalJWKSet,
  decodeJwt,
  jwtVerify,
  type JSONWebKeySet,
} from 'jose';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { TokenVerifier } from '@pistis/core';

import { createApp, operatorAgent } from './app.js';
import { FakePolisDirectory } from './fake-polis-directory.js';

const ISSUER = 'http://127.0.0.1/oidc';
const REDIRECT_URI = 'http://localhost:3000/auth/callback';
const ORG = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const PROJECT = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const PASSWORD = 'a long enough password';

const path = (location: string) => {
  const url = new URL(location, 'http://127.0.0.1');
  return url.pathname + url.search;
};

describe('Signing in and issuing tokens (e2e)', () => {
  let polis: FakePolisDirectory;
  let app: INestApplication<App>;
  let userId: string;

  beforeEach(async () => {
    polis = new FakePolisDirectory().addOrganization(ORG);
    app = await createApp(polis);
    const res = await (
      await operatorAgent(app)
    )
      .post('/v1/users')
      .send({
        displayName: 'Ada',
        email: 'ada@example.com',
        password: { login: 'ada@example.com', password: PASSWORD },
      })
      .expect(201);
    userId = (res.body as { id: string }).id;
  });

  afterEach(async () => {
    await app.close();
  });

  /**
   * Iris's side of the authorization code flow with PKCE: start, follow the
   * redirects through sign-in and consent, and end at the redirect URI.
   * Returns the callback URL (a code, or an error) and the PKCE verifier.
   */
  async function authorize(options: {
    resource?: string;
    password?: string;
    scope?: string;
  }) {
    const agent = request.agent(app.getHttpServer());
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const params = new URLSearchParams({
      client_id: 'iris',
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: options.scope ?? 'openid profile email api offline_access',
      prompt: 'consent',
      state: 'state-1',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      ...(options.resource ? { resource: options.resource } : {}),
    });

    let res = await agent.get(`/oidc/auth?${params}`).expect(303);
    const interaction = path(res.headers.location);
    expect(interaction).toMatch(/^\/interaction\/[\w-]+$/);

    const page = await agent.get(interaction).expect(200);
    expect(page.text).toContain('<form method="post"');

    res = await agent
      .post(`${interaction}/login`)
      .type('form')
      .send({
        login: 'Ada@Example.com',
        password: options.password ?? PASSWORD,
      });
    if (res.status !== 303) {
      return { res, verifier, callback: null, agent };
    }

    // Back to oidc-provider, which asks for consent, which Pistis decides.
    for (let hops = 0; hops < 6; hops++) {
      const location: string = res.headers.location;
      if (location.startsWith(REDIRECT_URI)) {
        return { res, verifier, callback: new URL(location), agent };
      }
      res = await agent.get(path(location)).expect(303);
    }
    throw new Error('Too many redirects');
  }

  async function exchange(code: string, verifier: string) {
    const res = await request(app.getHttpServer())
      .post('/oidc/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: 'iris',
        code_verifier: verifier,
      });
    return res;
  }

  async function verify(token: string) {
    const jwks = await request(app.getHttpServer())
      .get('/oidc/jwks')
      .expect(200);
    const { payload } = await jwtVerify(
      token,
      createLocalJWKSet(jwks.body as JSONWebKeySet),
      {
        issuer: ISSUER,
        audience: 'aether-os',
      },
    );
    return payload;
  }

  it('publishes its discovery document and keys', async () => {
    const res = await request(app.getHttpServer())
      .get('/oidc/.well-known/openid-configuration')
      .expect(200);
    expect(res.body).toMatchObject({
      issuer: ISSUER,
      code_challenge_methods_supported: ['S256'],
    });
    const jwks = await request(app.getHttpServer())
      .get('/oidc/jwks')
      .expect(200);
    expect((jwks.body as JSONWebKeySet).keys[0]).not.toHaveProperty('d');

    // The same public keys at the conventional path, without a token.
    const wellKnown = await request(app.getHttpServer())
      .get('/.well-known/jwks.json')
      .expect(200)
      .expect('cache-control', 'public, max-age=300');
    const kids = (set: JSONWebKeySet) => set.keys.map((key) => key.kid);
    expect(kids(wellKnown.body as JSONWebKeySet)).toEqual(
      kids(jwks.body as JSONWebKeySet),
    );
    for (const key of (wellKnown.body as JSONWebKeySet).keys) {
      expect(key).not.toHaveProperty('d');
    }
    // And a token verifies against it.
    const { callback, verifier } = await authorize({});
    const token = await exchange(callback!.searchParams.get('code')!, verifier);
    await jwtVerify(
      (token.body as { access_token: string }).access_token,
      createLocalJWKSet(wellKnown.body as JSONWebKeySet),
      { issuer: ISSUER, audience: 'aether-os' },
    );
  });

  it('signs in with a password and issues an organization token with roles from Polis', async () => {
    polis
      .addMember(userId, ORG, ['admin', 'member'])
      .grantProject(userId, ORG, PROJECT, 'approver');

    const { callback, verifier } = await authorize({
      resource: `urn:aether-os:org:${ORG}`,
    });
    expect(callback?.searchParams.get('state')).toBe('state-1');
    const code = callback!.searchParams.get('code')!;

    const res = await exchange(code, verifier);
    expect(res.status).toBe(200);
    const body = res.body as Record<string, string>;
    expect(body).toMatchObject({
      token_type: 'Bearer',
      scope: expect.stringContaining('api'),
    });
    expect(body.refresh_token).toBeTruthy();

    const claims = await verify(body.access_token);
    expect(claims).toMatchObject({
      sub: userId,
      sub_type: 'user',
      org_id: ORG,
      org_roles: ['admin', 'member'],
      project_roles: { [PROJECT]: 'approver' },
    });
    // What every service's AuthGuard does with it (Krepis).
    await expect(
      app.get(TokenVerifier).verify(body.access_token),
    ).resolves.toMatchObject({
      sub: userId,
      subType: 'user',
      organizationId: ORG,
      organizationRoles: ['admin', 'member'],
    });
    expect(decodeJwt(body.id_token)).toMatchObject({
      sub: userId,
      aud: 'iris',
    });

    // Refreshing asks Polis again: a revoked membership gets no new token.
    polis.removeMember(userId, ORG);
    const refreshed = await request(app.getHttpServer())
      .post('/oidc/token')
      .type('form')
      .send({
        grant_type: 'refresh_token',
        refresh_token: body.refresh_token,
        client_id: 'iris',
      });
    expect(refreshed.status).toBe(400);
    expect(refreshed.body).toMatchObject({ error: 'invalid_grant' });
  });

  it('issues a token without an organization for the platform resource', async () => {
    const { callback, verifier } = await authorize({});
    const res = await exchange(callback!.searchParams.get('code')!, verifier);
    expect(res.status).toBe(200);

    const claims = await verify(
      (res.body as { access_token: string }).access_token,
    );
    expect(claims).toMatchObject({ sub: userId, sub_type: 'user' });
    expect(claims).not.toHaveProperty('org_id');
  });

  it('denies an organization the user is not a member of', async () => {
    const { callback } = await authorize({
      resource: `urn:aether-os:org:${ORG}`,
    });
    expect(callback?.searchParams.get('error')).toBe('access_denied');
    expect(callback?.searchParams.get('code')).toBeNull();
  });

  it('denies a suspended organization', async () => {
    polis.addMember(userId, ORG, ['owner']).addOrganization(ORG, 'suspended');
    const { callback } = await authorize({
      resource: `urn:aether-os:org:${ORG}`,
    });
    expect(callback?.searchParams.get('error')).toBe('access_denied');
  });

  it('shows the sign-in page again for a wrong password', async () => {
    const { res, callback } = await authorize({ password: 'not the password' });
    expect(callback).toBeNull();
    expect(res.status).toBe(401);
    expect(res.text).toContain('The login or password is wrong.');
    expect(res.text).toContain('value="Ada@Example.com"');
  });

  it('issues no tokens to a user disabled after signing in', async () => {
    polis.addMember(userId, ORG, ['member']);
    const { callback, verifier } = await authorize({
      resource: `urn:aether-os:org:${ORG}`,
    });
    await (
      await operatorAgent(app)
    )
      .post(`/v1/users/${userId}/disable`)
      .expect(200);

    const res = await exchange(callback!.searchParams.get('code')!, verifier);
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: 'invalid_grant' });
  });

  it('requires PKCE', async () => {
    const res = await request(app.getHttpServer())
      .get('/oidc/auth')
      .query({
        client_id: 'iris',
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: 'openid api',
      })
      .expect(303);
    expect(new URL(res.headers.location).searchParams.get('error')).toBe(
      'invalid_request',
    );
  });

  it('issues platform services their own tokens with client credentials', async () => {
    const token = (scope: string) =>
      request(app.getHttpServer())
        .post('/oidc/token')
        .auth('hephaestus', 'hephaestus-test-secret')
        .type('form')
        .send({ grant_type: 'client_credentials', scope });

    const res = await token('platform:read').expect(200);
    const claims = await verify(
      (res.body as { access_token: string }).access_token,
    );
    expect(claims).toMatchObject({
      sub: 'hephaestus',
      sub_type: 'service',
      scope: 'platform:read',
    });
    expect(claims).not.toHaveProperty('org_id');

    // Only the platform permissions the client was given: others are dropped.
    const more = await token('platform:read platform:manage');
    const granted = await verify(
      (more.body as { access_token: string }).access_token,
    );
    expect(granted.scope).toBe('platform:read');
  });

  it('asks to confirm signing out, on its own page', async () => {
    // Signed in at Pistis (its session cookie is in the agent).
    const { agent } = await authorize({});
    const res = await agent
      .get('/oidc/session/end')
      .query({
        client_id: 'iris',
        post_logout_redirect_uri: 'http://localhost:3000/',
      })
      .expect(200);
    expect(res.text).toContain('Sign out of Aether-os?');
    expect(res.text).toContain('id="op.logoutForm"');
    // No external assets (fonts, scripts) on Pistis's pages.
    expect(res.text).not.toMatch(/https?:\/\/(?!127\.0\.0\.1|localhost)/);
  });
});
