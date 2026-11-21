import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { SecretStore } from '@hephaestus/core';

import { createApp, MISSING_ID } from './app.js';
import { asMember, type Client } from './auth.js';
import { FakeSecretStore } from './fake-models.js';
import type { FakePolis } from './fake-polis.js';
import { FakeToolServer } from './fake-tool-server.js';
import { tokens } from './tokens.js';

describe('Tool servers (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let secrets: FakeSecretStore;
  let toolServer: FakeToolServer;
  let orgId: string;
  let owner: Client;

  beforeEach(async () => {
    toolServer = await new FakeToolServer().start();
    secrets = new FakeSecretStore();
    ({ app, polis } = await createApp((builder) =>
      builder.overrideProvider(SecretStore).useValue(secrets),
    ));
    orgId = polis.organization();
    owner = await asMember(app, orgId, ['owner']);
  });

  afterEach(async () => {
    await app.close();
    await toolServer.stop();
  });

  const servers = () => `/v1/organizations/${orgId}/tool-servers`;

  it('registers tool servers, keeping credentials in OpenBao', async () => {
    const created = await owner
      .post(servers())
      .send({
        name: 'docs',
        description: 'Our documentation',
        url: toolServer.url,
        auth: { type: 'header', headerName: 'X-Api-Key' },
      })
      .expect(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      organizationId: orgId,
      name: 'docs',
      description: 'Our documentation',
      url: toolServer.url,
      auth: { type: 'header', headerName: 'X-Api-Key' },
      credential: null,
      createdBy: 'user-1',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const one = `${servers()}/${created.body.id}`;

    // Names are unique in the organization; members read, owners manage.
    const duplicate = await owner
      .post(servers())
      .send({ name: 'docs', url: toolServer.url, auth: { type: 'none' } })
      .expect(409);
    expect(duplicate.body.code).toBe('TOOL_SERVER_ALREADY_EXISTS');
    await owner
      .post(servers())
      .send({ name: 'Docs!', url: toolServer.url, auth: { type: 'none' } })
      .expect(400);
    const member = await asMember(app, orgId, ['member']);
    await member
      .post(servers())
      .send({ name: 'other', url: toolServer.url, auth: { type: 'none' } })
      .expect(403);
    expect((await member.get(servers()).expect(200)).body.items).toEqual([
      created.body,
    ]);

    // The credential: never returned, only its last characters.
    const withCredential = await owner
      .put(`${one}/credential`)
      .send({ value: ' docs-secret-a1b2 ' })
      .expect(200);
    expect(withCredential.body.credential).toEqual({
      hint: '…a1b2',
      updatedBy: 'user-1',
      updatedAt: expect.any(String),
    });
    expect(
      secrets.secrets.get(`orgs/${orgId}/tool-servers/${created.body.id}`),
    ).toEqual({ value: 'docs-secret-a1b2' });
    expect(
      JSON.stringify((await owner.get(one).expect(200)).body),
    ).not.toContain('docs-secret');
    await member
      .put(`${one}/credential`)
      .send({ value: 'docs-secret-a1b2' })
      .expect(403);

    // What it offers, asked with the credential.
    const tools = await member.get(`${one}/tools`).expect(200);
    expect(tools.body.items.map((tool: { name: string }) => tool.name)).toEqual(
      ['lookup', 'shout'],
    );
    expect(toolServer.requests.at(-1)?.['x-api-key']).toBe('docs-secret-a1b2');

    // A new description keeps the credential; a new authentication drops it.
    const described = await owner
      .put(one)
      .send({
        description: 'Docs',
        url: toolServer.url,
        auth: { type: 'header', headerName: 'X-Api-Key' },
      })
      .expect(200);
    expect(described.body.credential).not.toBeNull();
    const moved = await owner
      .put(one)
      .send({
        description: 'Docs',
        url: toolServer.url,
        auth: { type: 'none' },
      })
      .expect(200);
    expect(moved.body).toMatchObject({
      auth: { type: 'none', headerName: null },
      credential: null,
    });
    expect(
      secrets.secrets.has(`orgs/${orgId}/tool-servers/${created.body.id}`),
    ).toBe(false);
    const refused = await owner
      .put(`${one}/credential`)
      .send({ value: 'docs-secret-a1b2' })
      .expect(409);
    expect(refused.body.code).toBe('TOOL_SERVER_INVALID');

    await owner.delete(one).expect(204);
    await owner.delete(one).expect(204);
    await owner.get(one).expect(404);
    await owner.get(`${servers()}/${MISSING_ID}`).expect(404);
  });

  it("only sends a task's token to an origin the platform trusts", async () => {
    const refused = await owner
      .post(servers())
      .send({
        name: 'seshat',
        url: 'https://seshat.example.com/mcp',
        auth: { type: 'task-token' },
      })
      .expect(409);
    expect(refused.body).toMatchObject({
      code: 'TOOL_SERVER_INVALID',
      detail: expect.stringContaining('TOOL_SERVER_TRUSTED_ORIGINS'),
    });
    await owner
      .post(servers())
      .send({
        name: 'creds',
        url: 'https://user:pass@tools.example.com/mcp',
        auth: { type: 'none' },
      })
      .expect(409);
  });

  it('says when a tool server cannot be reached', async () => {
    const created = await owner
      .post(servers())
      .send({ name: 'docs', url: toolServer.url, auth: { type: 'none' } })
      .expect(201);
    toolServer.refuse = true;
    const failed = await owner
      .get(`${servers()}/${created.body.id}/tools`)
      .expect(503);
    expect(failed.body.detail).toContain("Tool server docs didn't answer");
  });

  it('checks the tool servers an agent version names', async () => {
    await owner
      .post(servers())
      .send({ name: 'docs', url: toolServer.url, auth: { type: 'none' } })
      .expect(201);
    // Agora asks before it creates a version (agent-version-checks).
    const agora = request
      .agent(app.getHttpServer())
      .set(
        'authorization',
        `Bearer ${await tokens.service('agora', ['platform:read'])}`,
      );
    const version = (tools: unknown) =>
      agora
        .post(`/v1/organizations/${orgId}/agent-version-checks`)
        .send({ tools });

    await version([
      { name: 'docs', enabled: true, tools: ['lookup'] },
      { name: 'later', enabled: false },
    ]).expect(204);
    const unknown = await version([{ name: 'later', enabled: true }]).expect(
      409,
    );
    expect(unknown.body).toMatchObject({
      code: 'TOOL_SERVER_INVALID',
      detail: 'The organization has no tool server named later.',
    });
    await version([
      { name: 'docs', enabled: true },
      { name: 'docs', enabled: false },
    ]).expect(409);
    // The free-form configuration is gone.
    await version([
      { name: 'docs', enabled: true, configuration: { depth: 2 } },
    ]).expect(400);
  });
});
