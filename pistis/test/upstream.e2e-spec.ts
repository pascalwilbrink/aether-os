import { createHash, randomBytes } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import { decodeJwt } from 'jose';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { createApp } from './app.js';
import { upstream } from './fake-upstream.js';

const REDIRECT_URI = 'http://localhost:3000/auth/callback';

const path = (location: string) => {
  const url = new URL(location, 'http://127.0.0.1');
  return url.pathname + url.search;
};

type Agent = ReturnType<typeof request.agent>;

describe('Signing in with an external OpenID Connect provider (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    upstream.reset();
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Starts Iris's authorization request: the browser and the sign-in page's URL. */
  async function begin() {
    const agent = request.agent(app.getHttpServer());
    const verifier = randomBytes(32).toString('base64url');
    const params = new URLSearchParams({
      client_id: 'iris',
      response_type: 'code',
      redirect_uri: REDIRECT_URI,
      scope: 'openid profile email api',
      state: 'iris-state',
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
    });
    const res = await agent.get(`/oidc/auth?${params}`).expect(303);
    return { agent, verifier, interaction: path(res.headers.location) };
  }

  /** Clicks "Sign in with Acme" and lets the upstream answer: Pistis's callback URL. */
  async function viaUpstream(agent: Agent, interaction: string) {
    const page = await agent.get(interaction).expect(200);
    expect(page.text).toContain(
      `href="${interaction}/upstream/acme">Sign in with Acme</a>`,
    );

    const start = await agent.get(`${interaction}/upstream/acme`).expect(303);
    const authorize = new URL(start.headers.location);
    expect(authorize.origin).toBe(upstream.issuer);
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1/interaction/callback/acme',
    );

    const answer = await fetch(authorize, { redirect: 'manual' });
    return path(answer.headers.get('location')!);
  }

  /** Follows Pistis's redirects to Iris's redirect URI, or returns the page it stops at. */
  async function follow(agent: Agent, location: string) {
    let res = await agent.get(location);
    for (let hops = 0; hops < 8 && res.status === 303; hops++) {
      const next: string = res.headers.location;
      if (next.startsWith(REDIRECT_URI)) {
        return { res, callback: new URL(next) };
      }
      res = await agent.get(path(next));
    }
    return { res, callback: null };
  }

  async function signIn() {
    const { agent, verifier, interaction } = await begin();
    const { callback } = await follow(
      agent,
      await viaUpstream(agent, interaction),
    );
    expect(callback?.searchParams.get('state')).toBe('iris-state');

    const token = await http()
      .post('/oidc/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: callback!.searchParams.get('code')!,
        redirect_uri: REDIRECT_URI,
        client_id: 'iris',
        code_verifier: verifier,
      })
      .expect(200);
    return decodeJwt((token.body as { access_token: string }).access_token)
      .sub!;
  }

  it('creates a user on the first sign-in and signs them in again later', async () => {
    const userId = await signIn();

    const user = await http().get(`/v1/users/${userId}`).expect(200);
    expect(user.body).toMatchObject({
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
    });
    const identities = await http()
      .get(`/v1/users/${userId}/providers`)
      .expect(200);
    expect(identities.body.items).toEqual([
      expect.objectContaining({
        provider: 'acme',
        subject: 'upstream-1',
        emailVerified: true,
      }),
    ]);

    await expect(signIn()).resolves.toBe(userId);
  });

  it('never matches an existing user by email', async () => {
    const existing = await http()
      .post('/v1/users')
      .send({
        displayName: 'Ada',
        email: 'ada@example.com',
        password: {
          login: 'ada@example.com',
          password: 'a long enough password',
        },
      })
      .expect(201);

    const userId = await signIn();
    expect(userId).not.toBe((existing.body as { id: string }).id);
  });

  it('signs in a user who linked the upstream identity', async () => {
    const existing = await http()
      .post('/v1/users')
      .send({
        displayName: 'Ada',
        email: 'ada@example.com',
        provider: {
          provider: 'acme',
          subject: 'upstream-1',
          email: null,
          emailVerified: false,
        },
      })
      .expect(201);

    await expect(signIn()).resolves.toBe((existing.body as { id: string }).id);
  });

  it('shows the sign-in page again when the upstream refuses', async () => {
    upstream.nextError = 'access_denied';
    const { agent, interaction } = await begin();
    const { res, callback } = await follow(
      agent,
      await viaUpstream(agent, interaction),
    );

    expect(callback).toBeNull();
    expect(res.status).toBe(400);
    expect(res.text).toContain('Acme did not sign you in.');
    expect(upstream.tokenRequests).toBe(0);
  });

  it('rejects an ID token with the wrong nonce', async () => {
    upstream.nonceOverride = 'someone-elses-nonce';
    const { agent, interaction } = await begin();
    const { res, callback } = await follow(
      agent,
      await viaUpstream(agent, interaction),
    );

    expect(callback).toBeNull();
    expect(res.text).toContain(
      'Signing in with Acme failed. Please try again.',
    );
  });

  it('redeems each upstream answer once', async () => {
    const { agent, interaction } = await begin();
    const answer = await viaUpstream(agent, interaction);
    const relay = await agent.get(answer).expect(303);
    await follow(agent, path(relay.headers.location));

    const again = await agent.get(path(relay.headers.location));
    expect(again.status).not.toBe(303);
    expect(upstream.tokenRequests).toBe(1);
  });

  it('refuses an upstream answer it did not ask for', async () => {
    const res = await http()
      .get('/interaction/callback/acme?code=x&state=forged')
      .expect(400);
    expect(res.text).toContain('This sign-in has expired.');
  });

  it('only finishes a sign-in in the browser that started it', async () => {
    const { agent, interaction } = await begin();
    const answer = await viaUpstream(agent, interaction);
    const relay = await agent.get(answer).expect(303);

    // Another browser, without the interaction's cookie.
    const res = await http().get(path(relay.headers.location));
    expect(res.status).toBe(400);
    expect(res.text).toContain('was started in another browser');
    expect(upstream.tokenRequests).toBe(0);
  });

  it('refuses disabled users', async () => {
    const userId = await signIn();
    await http().post(`/v1/users/${userId}/disable`).expect(200);

    const { agent, interaction } = await begin();
    const { res } = await follow(agent, await viaUpstream(agent, interaction));
    expect(res.status).toBe(401);
    expect(res.text).toContain('This account is disabled.');
  });
});
