import type { INestApplication } from '@nestjs/common';
import { decodeJwt } from 'jose';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { TokenVerifier } from '@pistis/core';
import { TokenSigner } from '@pistis/oidc';

import { createApp, operatorAgent } from './app.js';
import { FakePolisDirectory } from './fake-polis-directory.js';

const ORG = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const PROJECT = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const OTHER_PROJECT = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5e';
const SESSION = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d';
const AGENT = '0193a1b2-c3d4-7e5f-8a9b-0000000000a2';
const EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';
const ACCESS_TOKEN = 'urn:ietf:params:oauth:token-type:access_token';

describe('Session tokens (e2e)', () => {
  let polis: FakePolisDirectory;
  let app: INestApplication<App>;
  let userId: string;

  beforeEach(async () => {
    polis = new FakePolisDirectory().addOrganization(ORG);
    app = await createApp(polis);
    const operator = await operatorAgent(app);
    userId = (
      await operator
        .post('/v1/users')
        .send({
          displayName: 'Ada',
          email: 'ada@example.com',
          provider: {
            provider: 'google',
            subject: '110169484474386276334',
            email: 'ada@example.com',
            emailVerified: true,
          },
        })
        .expect(201)
    ).body.id as string;
    polis
      .addMember(userId, ORG, ['member'])
      .grantProject(userId, ORG, PROJECT, 'viewer');
  });

  afterEach(async () => {
    await app.close();
  });

  /** The person's own access token for the organization, as Iris holds it. */
  const userToken = (claims: Record<string, unknown> = {}) =>
    app.get(TokenSigner).sign(
      {
        sub: userId,
        sub_type: 'user',
        org_id: ORG,
        org_roles: ['member'],
        project_roles: { [PROJECT]: 'viewer' },
        scope: 'api',
        ...claims,
      },
      600,
    );

  const sessionToken = (
    subject: string,
    extra: Record<string, string> = {},
    client: [string, string] = ['hephaestus', 'hephaestus-test-secret'],
  ) =>
    request(app.getHttpServer())
      .post('/oidc/token')
      .auth(...client)
      .type('form')
      .send({
        grant_type: EXCHANGE,
        subject_token: subject,
        subject_token_type: ACCESS_TOKEN,
        project_id: PROJECT,
        session_id: SESSION,
        ...extra,
      });

  it('exchanges a person’s token for a short, read-only session token', async () => {
    const res = await sessionToken(await userToken(), {
      agent_id: AGENT,
      expires_in: '99999',
    }).expect(200);
    expect(res.body.expires_in).toBe(900);
    expect(decodeJwt(res.body.access_token)).toMatchObject({
      sub: userId,
      sub_type: 'user',
      org_id: ORG,
      project_id: PROJECT,
      session_id: SESSION,
      agent_id: AGENT,
      act: { sub: 'hephaestus', sub_type: 'service' },
    });
    const principal = await app
      .get(TokenVerifier)
      .verify(res.body.access_token);
    expect(principal).toMatchObject({
      sub: userId,
      projectId: PROJECT,
      sessionId: SESSION,
      actor: { sub: 'hephaestus' },
    });
  });

  it('refuses other clients, chains, foreign tokens and people without a role', async () => {
    const token = await userToken();
    // A client without session-token.
    expect(
      (await sessionToken(token, {}, ['api-key', '']).expect(400)).body.error,
    ).toBeDefined();
    const missing = await sessionToken(token, { session_id: 'nope' }).expect(
      400,
    );
    expect(missing.body.error).toBe('invalid_request');

    // A session or task token can't be exchanged again.
    const session = (await sessionToken(token).expect(200)).body
      .access_token as string;
    expect((await sessionToken(session).expect(400)).body.error).toBe(
      'invalid_grant',
    );
    // Not a token Pistis signed; a platform service's own token.
    expect((await sessionToken('not.a.token').expect(400)).body.error).toBe(
      'invalid_grant',
    );
    const service = await app
      .get(TokenSigner)
      .sign(
        { sub: 'kerykes', sub_type: 'service', scope: 'platform:read' },
        600,
      );
    expect((await sessionToken(service).expect(400)).body.error).toBe(
      'invalid_grant',
    );

    // No role in that project (Polis, not the token, decides).
    expect(
      (await sessionToken(token, { project_id: OTHER_PROJECT }).expect(400))
        .body.error,
    ).toBe('invalid_target');
    // No longer a member.
    polis.removeMember(userId, ORG);
    expect((await sessionToken(token).expect(400)).body.error).toBe(
      'invalid_grant',
    );
  });
});
