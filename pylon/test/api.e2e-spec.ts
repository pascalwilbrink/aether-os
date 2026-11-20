import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';

import { EventInbox } from '@pylon/core';

import {
  agoraAgent,
  asMember,
  asPlatform,
  createApp,
  TREE_ID,
  type Client,
} from './app.js';
import type { FakePolis } from './fake-polis.js';
import type { FakeSecretStore } from './fake-secrets.js';
import { outboxEvents } from './outbox.js';

const MISSING_ID = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

describe('Catalogue, keys and budgets (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let secrets: FakeSecretStore;
  let orgId: string;
  let projectId: string;
  let owner: Client;

  beforeEach(async () => {
    ({ app, polis, secrets } = await createApp());
    orgId = polis.organization();
    projectId = polis.project(orgId);
    owner = await asMember(app, orgId, ['owner']);
  });

  afterEach(async () => {
    await app.close();
  });

  describe('the catalogue', () => {
    it('lists the seeded models, filtered, with their kind and price', async () => {
      const embeddings = await owner
        .get('/v1/models?kind=embedding')
        .expect(200);
      expect(
        embeddings.body.items.map((m: { model: string }) => m.model),
      ).toEqual(['text-embedding-3-large', 'text-embedding-3-small']);
      expect(embeddings.body.items[1]).toMatchObject({
        provider: 'openai',
        kind: 'embedding',
        status: 'active',
        price: { inputPerMTok: '0.020000', outputPerMTok: '0.000000' },
      });

      // Agora's check: one model by its provider's ID.
      const one = await owner
        .get('/v1/models?provider=anthropic&model=claude-sonnet-5-5')
        .expect(200);
      expect(one.body.items).toHaveLength(1);
      expect(one.body.items[0]).toMatchObject({
        kind: 'chat',
        status: 'active',
      });
    });

    it('is changed only by platform services with platform:manage', async () => {
      const body = {
        provider: 'mistral',
        model: 'mistral-embed',
        kind: 'embedding',
        name: 'Mistral Embed',
        price: { inputPerMTok: '0.1', outputPerMTok: '0' },
      };
      await owner.post('/v1/models').send(body).expect(403);
      const platform = await asPlatform(app, ['platform:manage']);
      const created = await platform.post('/v1/models').send(body).expect(201);
      expect(created.body).toMatchObject({ kind: 'embedding', version: 1 });
      const again = await platform.post('/v1/models').send(body).expect(409);
      expect(again.body.code).toBe('MODEL_ALREADY_EXISTS');
    });
  });

  describe('keys', () => {
    it("stores the organization's and an agent's keys in OpenBao, never returning them", async () => {
      const set = await owner
        .put(`/v1/organizations/${orgId}/model-keys/anthropic`)
        .send({ apiKey: 'sk-ant-secret-1234' })
        .expect(200);
      expect(set.body).toMatchObject({
        provider: 'anthropic',
        scope: 'organization',
        hint: '…1234',
      });
      expect(JSON.stringify(set.body)).not.toContain('secret');
      expect(secrets.secrets.get(`orgs/${orgId}/llm/anthropic`)).toEqual({
        apiKey: 'sk-ant-secret-1234',
      });

      // An agent Pylon has from Agora's events; another is a 404.
      await owner
        .put(
          `/v1/organizations/${orgId}/agents/${MISSING_ID}/model-keys/openai`,
        )
        .send({ apiKey: 'sk-agent-5678' })
        .expect(404);
      const agentId = await agoraAgent(app, orgId);
      await owner
        .put(`/v1/organizations/${orgId}/agents/${agentId}/model-keys/openai`)
        .send({ apiKey: 'sk-agent-5678' })
        .expect(200);
      expect(
        secrets.secrets.get(`orgs/${orgId}/agents/${agentId}/llm/openai`),
      ).toEqual({ apiKey: 'sk-agent-5678' });
      const agentKeys = await owner
        .get(`/v1/organizations/${orgId}/agents/${agentId}/model-keys`)
        .expect(200);
      expect(agentKeys.body.items).toMatchObject([
        { provider: 'openai', scope: 'agent', agentId },
      ]);

      // Writing keys is for owners and admins.
      const member = await asMember(app, orgId, ['member']);
      await member
        .put(`/v1/organizations/${orgId}/model-keys/openai`)
        .send({ apiKey: 'sk-member-0000' })
        .expect(403);

      // OpenBao down: nothing stored, and the reason said.
      secrets.down = true;
      const down = await owner
        .put(`/v1/organizations/${orgId}/model-keys/openai`)
        .send({ apiKey: 'sk-down-0000' })
        .expect(503);
      expect(down.body.detail).toContain("OpenBao isn't answering");
      secrets.down = false;
      const list = await owner
        .get(`/v1/organizations/${orgId}/model-keys`)
        .expect(200);
      expect(
        list.body.items.map((k: { provider: string }) => k.provider),
      ).toEqual(['anthropic']);

      await owner
        .delete(`/v1/organizations/${orgId}/model-keys/anthropic`)
        .expect(204);
      expect(secrets.secrets.has(`orgs/${orgId}/llm/anthropic`)).toBe(false);
    });

    it('checks settings, and refuses writes in a suspended organization', async () => {
      const invalid = await owner
        .put(`/v1/organizations/${orgId}/model-keys/ollama`)
        .send({ apiKey: 'sk-without-server' })
        .expect(409);
      expect(invalid.body.code).toBe('MODEL_KEY_INVALID');

      polis.organizations.get(orgId)!.status = 'suspended';
      const suspended = await owner
        .put(`/v1/organizations/${orgId}/model-keys/openai`)
        .send({ apiKey: 'sk-1234567890' })
        .expect(409);
      expect(suspended.body.code).toBe('ORGANIZATION_SUSPENDED');
    });
  });

  describe('budgets', () => {
    it("sets an organization's, a project's, an agent's and a task tree's, announcing each change", async () => {
      await owner
        .put(`/v1/organizations/${orgId}/budget`)
        .send({ limitUsd: '100' })
        .expect(200);
      const project = await owner
        .put(`/v1/organizations/${orgId}/projects/${projectId}/budget`)
        .send({ limitUsd: '10.5' })
        .expect(200);
      expect(project.body).toMatchObject({
        scope: 'project',
        scopeId: projectId,
        limitUsd: '10.500000',
        spentUsd: '0.000000',
        thresholdPercent: 80,
      });
      expect(project.body.windowStart).toMatch(/-01T00:00:00.000Z$/);

      const agentId = await agoraAgent(app, orgId);
      await owner
        .put(`/v1/organizations/${orgId}/agents/${agentId}/budget`)
        .send({ limitUsd: '5' })
        .expect(200);
      await owner
        .get(`/v1/organizations/${orgId}/agents/${MISSING_ID}/budget`)
        .expect(404);

      const tree = `/v1/organizations/${orgId}/projects/${projectId}/task-trees/${TREE_ID}/budget`;
      const set = await owner.put(tree).send({ limitUsd: '1' }).expect(200);
      expect(set.body).toMatchObject({ scope: 'task_tree', windowStart: null });
      // Hephaestus reads it with its own token.
      const hephaestus = await asPlatform(app, ['platform:read']);
      await hephaestus.get(tree).expect(200);
      // Setting it takes task:create in the project.
      const viewer = await asMember(app, orgId, ['member'], {
        projectRoles: { [projectId]: 'viewer' },
      });
      await viewer.get(tree).expect(200);
      await viewer.put(tree).send({ limitUsd: '2' }).expect(403);

      // The same limit again changes nothing.
      await owner.put(tree).send({ limitUsd: '1.000000' }).expect(200);
      const changed = (await outboxEvents(app)).filter(
        (event) => event.eventType === 'budget.changed',
      );
      expect(changed.map((event) => event.payload)).toEqual([
        expect.objectContaining({
          scope: 'organization',
          limitUsd: '100.000000',
        }),
        expect.objectContaining({ scope: 'project', limitUsd: '10.500000' }),
        expect.objectContaining({ scope: 'agent', scopeId: agentId }),
        expect.objectContaining({ scope: 'task_tree', scopeId: TREE_ID }),
      ]);

      // Removing a limit.
      const removed = await owner
        .put(`/v1/organizations/${orgId}/budget`)
        .send({ limitUsd: null })
        .expect(200);
      expect(removed.body.limitUsd).toBeNull();
    });

    it('lets only those who may change them', async () => {
      const member = await asMember(app, orgId, ['member']);
      await member
        .put(`/v1/organizations/${orgId}/budget`)
        .send({ limitUsd: '1' })
        .expect(403);
      await member.get(`/v1/organizations/${orgId}/budget`).expect(200);
      await member.get(`/v1/organizations/${orgId}/usage`).expect(200);
    });
  });

  it("keeps a copy of Agora's agents, never moving back", async () => {
    const agentId = await agoraAgent(app, orgId);
    const inbox = app.get(EventInbox);
    const archived = (version: number) =>
      inbox.receive('agora', {
        eventId: uuidv7(),
        eventType: 'agent.archived',
        schemaVersion: 1,
        aggregateId: agentId,
        aggregateVersion: version,
        occurredAt: new Date(),
        organizationId: orgId,
        projectId: null,
        actor: null,
        payload: { agentId },
      });
    await archived(3);
    // An archived agent's keys and budget can still be read.
    await owner
      .get(`/v1/organizations/${orgId}/agents/${agentId}/budget`)
      .expect(200);
    // Another organization's agent isn't there.
    const other = polis.organization();
    await (
      await asMember(app, other, ['owner'])
    )
      .get(`/v1/organizations/${other}/agents/${agentId}/budget`)
      .expect(404);

    // An event about an agent Pylon hasn't seen yet is retried.
    await expect(
      inbox.receive('agora', {
        eventId: uuidv7(),
        eventType: 'agent.archived',
        schemaVersion: 1,
        aggregateId: MISSING_ID,
        aggregateVersion: 2,
        occurredAt: new Date(),
        organizationId: orgId,
        projectId: null,
        actor: null,
        payload: { agentId: MISSING_ID },
      }),
    ).rejects.toThrow(/isn't in Pylon's copy yet/);
  });
});
