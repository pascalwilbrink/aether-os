import type { INestApplication } from '@nestjs/common';
import { decodeJwt } from 'jose';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { TokenVerifier } from '@pistis/core';

import { createApp, memberAgent } from './app.js';
import { FakePolisDirectory } from './fake-polis-directory.js';

const ORG = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const OTHER_ORG = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5e';
const PROJECT = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c';
const TASK = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d';
const EXCHANGE = 'urn:ietf:params:oauth:grant-type:token-exchange';

describe('Service accounts and token exchange (e2e)', () => {
  let polis: FakePolisDirectory;
  let app: INestApplication<App>;
  let admin: Awaited<ReturnType<typeof memberAgent>>;
  let base: string;

  beforeEach(async () => {
    polis = new FakePolisDirectory().addOrganization(ORG);
    app = await createApp(polis);
    admin = await memberAgent(app, ORG, ['admin']);
    base = `/v1/organizations/${ORG}/service-accounts`;
  });

  afterEach(async () => {
    await app.close();
  });

  const createAccount = async (name = 'Deploy bot') =>
    (
      await admin
        .post(base)
        .send({ name, description: 'Deploys on merge' })
        .expect(201)
    ).body as { id: string };

  const createKey = async (accountId: string, body: object = { name: 'CI' }) =>
    (await admin.post(`${base}/${accountId}/api-keys`).send(body).expect(201))
      .body as { id: string; key: string; prefix: string };

  const exchangeKey = (key: string) =>
    request(app.getHttpServer()).post('/oidc/token').type('form').send({
      grant_type: EXCHANGE,
      client_id: 'api-key',
      subject_token: key,
      subject_token_type: 'urn:aether-os:token-type:api-key',
    });

  const taskToken = (
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
        subject_token_type: 'urn:aether-os:token-type:service-account',
        project_id: PROJECT,
        task_id: TASK,
        ...extra,
      });

  it('manages service accounts in the organization', async () => {
    const account = await createAccount();
    const res = await admin.get(`${base}/${account.id}`).expect(200);
    expect(res.body).toMatchObject({
      organizationId: ORG,
      name: 'Deploy bot',
      status: 'active',
      createdBy: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a00',
    });
    await admin.post(`${base}/${account.id}/disable`).expect(200);
    await admin.post(`${base}/${account.id}/disable`).expect(200);
    const enabled = await admin
      .post(`${base}/${account.id}/enable`)
      .expect(200);
    expect(enabled.body.status).toBe('active');

    // Members read; only admins (service-account:manage) change.
    const member = await memberAgent(app, ORG, ['member']);
    const list = await member.get(base).expect(200);
    expect(list.body.items).toHaveLength(1);
    await member.post(base).send({ name: 'x', description: '' }).expect(403);

    // Another organization's token can't see them.
    const other = await memberAgent(app, OTHER_ORG, ['owner']);
    await other
      .get(`/v1/organizations/${OTHER_ORG}/service-accounts/${account.id}`)
      .expect(404);
    await other.get(`${base}/${account.id}`).expect(404);
  });

  it('shows an API key once and keeps only its hash', async () => {
    const account = await createAccount();
    const key = await createKey(account.id);
    expect(key.key).toMatch(/^aos_[A-Za-z0-9_-]{43}$/);
    expect(key.key.startsWith(key.prefix)).toBe(true);

    const keys = await admin.get(`${base}/${account.id}/api-keys`).expect(200);
    expect(keys.body.items).toEqual([
      expect.objectContaining({
        id: key.id,
        prefix: key.prefix,
        lastUsedAt: null,
      }),
    ]);
    expect(JSON.stringify(keys.body)).not.toContain(key.key);
  });

  it('exchanges an API key for a token of the service account', async () => {
    const account = await createAccount();
    polis
      .addMember(account.id, ORG, ['member'])
      .grantProject(account.id, ORG, PROJECT, 'editor');
    const { key, id } = await createKey(account.id);

    const res = await exchangeKey(key).expect(200);
    expect(res.body).toMatchObject({
      token_type: 'Bearer',
      issued_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      expires_in: 600,
    });
    // What every service's guard makes of it (Krepis).
    await expect(
      app.get(TokenVerifier).verify(res.body.access_token),
    ).resolves.toMatchObject({
      sub: account.id,
      subType: 'service_account',
      organizationId: ORG,
      organizationRoles: ['member'],
      projectRoles: { [PROJECT]: 'editor' },
      projectId: null,
    });

    const keys = await admin.get(`${base}/${account.id}/api-keys`).expect(200);
    expect(keys.body.items[0]).toMatchObject({
      id,
      lastUsedAt: expect.any(String),
    });
  });

  it('refuses API keys that are wrong, revoked, expired, or of a disabled or removed account', async () => {
    const account = await createAccount();
    polis.addMember(account.id, ORG, ['member']);
    const { key, id } = await createKey(account.id);

    const wrong = await exchangeKey(`${key.slice(0, -1)}x`).expect(400);
    expect(wrong.body.error).toBe('invalid_grant');

    // Not a member any more: no token.
    polis.removeMember(account.id, ORG);
    expect((await exchangeKey(key).expect(400)).body.error).toBe(
      'invalid_grant',
    );
    polis.addMember(account.id, ORG, ['member']);

    // A suspended organization: no token.
    polis.addOrganization(ORG, 'suspended');
    await exchangeKey(key).expect(400);
    polis.addOrganization(ORG, 'active');

    await admin.post(`${base}/${account.id}/disable`).expect(200);
    await exchangeKey(key).expect(400);
    await admin.post(`${base}/${account.id}/enable`).expect(200);
    await exchangeKey(key).expect(200);

    await admin.delete(`${base}/${account.id}/api-keys/${id}`).expect(204);
    await exchangeKey(key).expect(400);

    const expired = await createKey(account.id, {
      name: 'old',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    await exchangeKey(expired.key).expect(400);

    // A disabled account gets no new keys.
    await admin.post(`${base}/${account.id}/disable`).expect(200);
    const refused = await admin
      .post(`${base}/${account.id}/api-keys`)
      .send({ name: 'x' })
      .expect(409);
    expect(refused.body.code).toBe('SERVICE_ACCOUNT_DISABLED');
  });

  it('issues Hephaestus task tokens, limited to the project and task', async () => {
    const account = await createAccount('Automation');
    polis
      .addMember(account.id, ORG, ['member'])
      .grantProject(account.id, ORG, PROJECT, 'editor');

    const res = await taskToken(account.id, { expires_in: '99999' }).expect(
      200,
    );
    expect(res.body.expires_in).toBe(3600);
    expect(decodeJwt(res.body.access_token)).toMatchObject({
      sub: account.id,
      sub_type: 'service_account',
      org_id: ORG,
      project_id: PROJECT,
      task_id: TASK,
      act: { sub: 'hephaestus', sub_type: 'service' },
    });
    await expect(
      app.get(TokenVerifier).verify(res.body.access_token),
    ).resolves.toMatchObject({
      projectId: PROJECT,
      taskId: TASK,
      actor: { sub: 'hephaestus' },
    });

    const short = await taskToken(account.id, { expires_in: '300' }).expect(
      200,
    );
    expect(short.body.expires_in).toBe(300);
  });

  it('refuses task tokens to other clients, and for projects without a role', async () => {
    const account = await createAccount();
    polis.addMember(account.id, ORG, ['member']);

    // No role in the project.
    expect((await taskToken(account.id).expect(400)).body.error).toBe(
      'invalid_target',
    );

    polis.grantProject(account.id, ORG, PROJECT, 'viewer');
    await taskToken(account.id).expect(200);

    // Only clients allowed to (Hephaestus); not the operator, not api-key.
    const operator = await taskToken(account.id, {}, [
      'operator',
      'operator-test-secret',
    ]);
    expect([400, 401]).toContain(operator.status);
    const viaApiKeyClient = await request(app.getHttpServer())
      .post('/oidc/token')
      .type('form')
      .send({
        grant_type: EXCHANGE,
        client_id: 'api-key',
        subject_token: account.id,
        subject_token_type: 'urn:aether-os:token-type:service-account',
        project_id: PROJECT,
        task_id: TASK,
      });
    expect(viaApiKeyClient.status).toBe(400);
    expect(viaApiKeyClient.body.error).toBe('unauthorized_client');

    // Hephaestus can't exchange an API key, and needs a project and task.
    const { key } = await createKey(account.id);
    const apiKeyViaHephaestus = await request(app.getHttpServer())
      .post('/oidc/token')
      .auth('hephaestus', 'hephaestus-test-secret')
      .type('form')
      .send({
        grant_type: EXCHANGE,
        subject_token: key,
        subject_token_type: 'urn:aether-os:token-type:api-key',
      });
    expect(apiKeyViaHephaestus.body.error).toBe('unauthorized_client');
    expect(
      (await taskToken(account.id, { project_id: 'nope' }).expect(400)).body
        .error,
    ).toBe('invalid_request');

    // Unknown or disabled service accounts.
    await taskToken('0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4aff').expect(400);
    await admin.post(`${base}/${account.id}/disable`).expect(200);
    expect((await taskToken(account.id).expect(400)).body.error).toBe(
      'invalid_grant',
    );
  });
});
