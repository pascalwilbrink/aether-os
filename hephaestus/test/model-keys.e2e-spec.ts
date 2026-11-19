import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';

import { SecretStore, SecretStoreUnavailableError } from '@hephaestus/core';

import { createApp, MISSING_ID } from './app.js';
import { asMember, type Client } from './auth.js';
import { FakeSecretStore } from './fake-models.js';
import type { FakePolis } from './fake-polis.js';

const KEY = 'sk-ant-api03-secret-value-a1b2';

describe('Model keys (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let secrets: FakeSecretStore;
  let orgId: string;
  let owner: Client;
  let agentId: string;

  beforeEach(async () => {
    secrets = new FakeSecretStore();
    ({ app, polis } = await createApp((builder) =>
      builder.overrideProvider(SecretStore).useValue(secrets),
    ));
    orgId = polis.organization();
    owner = await asMember(app, orgId, ['owner']);
    agentId = (
      await owner
        .post(`/v1/organizations/${orgId}/agents`)
        .send({ name: 'Fixer', description: '' })
        .expect(201)
    ).body.id;
  });

  afterEach(async () => {
    await app.close();
  });

  const orgKeys = () => `/v1/organizations/${orgId}/model-keys`;
  const agentKeys = () =>
    `/v1/organizations/${orgId}/agents/${agentId}/model-keys`;

  it("sets the organization's keys in OpenBao, never returning them", async () => {
    const set = await owner
      .put(`${orgKeys()}/anthropic`)
      .send({ apiKey: ` ${KEY} ` })
      .expect(200);
    expect(set.body).toEqual({
      provider: 'anthropic',
      scope: 'organization',
      agentId: null,
      hint: '…a1b2',
      updatedBy: 'user-1',
      updatedAt: expect.any(String),
    });
    expect(secrets.secrets.get(`orgs/${orgId}/llm/anthropic`)).toEqual({
      apiKey: KEY,
    });

    const viewer = await asMember(app, orgId, ['viewer']);
    const listed = await viewer.get(orgKeys()).expect(200);
    expect(listed.body.items).toEqual([set.body]);
    expect(JSON.stringify(listed.body)).not.toContain('secret-value');

    // Only owners and admins (org:secret:write).
    const member = await asMember(app, orgId, ['member']);
    await member.put(`${orgKeys()}/openai`).send({ apiKey: KEY }).expect(403);
    await member.delete(`${orgKeys()}/anthropic`).expect(403);
    await owner.put(`${orgKeys()}/acme`).send({ apiKey: KEY }).expect(400);
    await owner
      .put(`${orgKeys()}/openai`)
      .send({ apiKey: 'short' })
      .expect(400);

    // Replacing keeps one; removing takes it out of OpenBao.
    await owner
      .put(`${orgKeys()}/anthropic`)
      .send({ apiKey: 'sk-ant-replaced-zzzz' })
      .expect(200);
    expect((await owner.get(orgKeys()).expect(200)).body.items).toMatchObject([
      { provider: 'anthropic', hint: '…zzzz' },
    ]);
    await owner.delete(`${orgKeys()}/anthropic`).expect(204);
    await owner.delete(`${orgKeys()}/anthropic`).expect(204);
    expect(secrets.secrets.has(`orgs/${orgId}/llm/anthropic`)).toBe(false);
    expect((await owner.get(orgKeys()).expect(200)).body.items).toEqual([]);
  });

  it("gives an agent its own key, used instead of the organization's", async () => {
    const set = await owner
      .put(`${agentKeys()}/openai`)
      .send({ apiKey: 'sk-proj-agent-key-9876' })
      .expect(200);
    expect(set.body).toMatchObject({
      provider: 'openai',
      scope: 'agent',
      agentId,
      hint: '…9876',
    });
    expect(
      secrets.secrets.get(`orgs/${orgId}/agents/${agentId}/llm/openai`),
    ).toEqual({ apiKey: 'sk-proj-agent-key-9876' });
    // The organization's list is the organization's alone.
    expect((await owner.get(orgKeys()).expect(200)).body.items).toEqual([]);
    expect((await owner.get(agentKeys()).expect(200)).body.items).toEqual([
      set.body,
    ]);

    // Another organization's agent, or none, is a 404.
    await owner
      .put(`/v1/organizations/${orgId}/agents/${MISSING_ID}/model-keys/openai`)
      .send({ apiKey: KEY })
      .expect(404);
    const editor = await asMember(app, orgId, ['member']);
    await editor.get(agentKeys()).expect(200);
    await editor.put(`${agentKeys()}/openai`).send({ apiKey: KEY }).expect(403);

    await owner.delete(`${agentKeys()}/openai`).expect(204);
    expect(
      secrets.secrets.has(`orgs/${orgId}/agents/${agentId}/llm/openai`),
    ).toBe(false);
  });

  it("stores nothing when OpenBao can't take the key", async () => {
    secrets.write = () =>
      Promise.reject(new SecretStoreUnavailableError('OpenBao is down'));

    const down = await owner
      .put(`${orgKeys()}/anthropic`)
      .send({ apiKey: KEY })
      .expect(503);
    expect(down.body.detail).toBe(
      "Keys can't be stored right now: OpenBao isn't answering. Try again in a moment.",
    );

    // Why it failed, for whoever runs Aether-os: not configured, or a token it refuses.
    secrets.write = () =>
      Promise.reject(
        new SecretStoreUnavailableError(
          'OpenBao is not configured',
          'not-configured',
        ),
      );
    const unconfigured = await owner
      .put(`${orgKeys()}/anthropic`)
      .send({ apiKey: KEY })
      .expect(503);
    expect(unconfigured.body.detail).toContain(
      'OPENBAO_ADDR and OPENBAO_TOKEN',
    );
    secrets.write = () =>
      Promise.reject(
        new SecretStoreUnavailableError('OpenBao answered 403', 'refused'),
      );
    const refused = await owner
      .put(`${orgKeys()}/anthropic`)
      .send({ apiKey: KEY })
      .expect(503);
    expect(refused.body.detail).toContain("refused Hephaestus's token");

    expect((await owner.get(orgKeys()).expect(200)).body.items).toEqual([]);
  });
});
