import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { webhookSignature } from '@proxenos/github';

import { asMember, asTask, createApp, WEBHOOK_SECRET } from './app.js';
import type { FakePolis } from './fake-polis.js';
import { github } from './github.js';
import { outboxEvents } from './outbox.js';

const API = {
  id: '1001',
  fullName: 'acme/api',
  defaultBranch: 'main',
  private: true,
};
const WEB = {
  id: '1002',
  fullName: 'acme/web',
  defaultBranch: 'trunk',
  private: false,
};

describe('GitHub: connecting, links, tokens, webhooks (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let orgId: string;
  let projectId: string;
  let delivery = 0;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    orgId = polis.organization();
    projectId = polis.project(orgId);
  });

  afterEach(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  /** Starts connecting as an owner; the state from the install URL. */
  async function start(organizationId = orgId, body: object = {}) {
    const owner = await asMember(app, organizationId, ['owner']);
    const res = await owner
      .post(`/v1/organizations/${organizationId}/github/connect`)
      .send(body)
      .expect(201);
    const url = new URL(res.body.installUrl);
    expect(url.origin + url.pathname).toBe(
      `${github.url}/apps/aether-os-test/installations/new`,
    );
    return url.searchParams.get('state')!;
  }

  /** GitHub sending the browser back to the setup URL. */
  const setup = (query: Record<string, string>) =>
    http().get('/v1/github/setup').query(query).expect(303);

  /** An organization with installation 77 (acme/api, acme/web) connected. */
  async function connected(organizationId = orgId) {
    github.addInstallation('77', [API, WEB]);
    github.codes.set('code-77', ['77']);
    const state = await start(organizationId);
    const res = await setup({
      installation_id: '77',
      setup_action: 'install',
      state,
      code: 'code-77',
    });
    expect(res.headers.location).toBe(
      `https://iris.test/orgs/${organizationId}?github=connected`,
    );
    const owner = await asMember(app, organizationId, ['owner']);
    const repositories = (
      await owner
        .get(`/v1/organizations/${organizationId}/repositories`)
        .expect(200)
    ).body.items as { id: string; fullName: string }[];
    return {
      installation: (
        await owner
          .get(`/v1/organizations/${organizationId}/installations`)
          .expect(200)
      ).body.items[0] as { id: string },
      api: repositories.find((r) => r.fullName === 'acme/api')!,
      web: repositories.find((r) => r.fullName === 'acme/web')!,
    };
  }

  const link = async (repositoryId: string) =>
    (
      await (
        await asMember(app, orgId, ['owner'])
      )
        .post(`/v1/organizations/${orgId}/projects/${projectId}/repositories`)
        .send({ repositoryId })
        .expect(201)
    ).body as { id: string };

  /** A delivery as GitHub signs it. */
  const deliver = (event: string, payload: object, secret = WEBHOOK_SECRET) => {
    const body = Buffer.from(JSON.stringify(payload));
    return http()
      .post('/v1/webhooks/github')
      .set('content-type', 'application/json')
      .set('x-github-event', event)
      .set('x-github-delivery', `delivery-${++delivery}`)
      .set('x-hub-signature-256', webhookSignature(secret, body))
      .send(body.toString());
  };

  it('connects an installation, after checking the person can access it', async () => {
    const { installation } = await connected();
    const owner = await asMember(app, orgId, ['owner']);

    expect(
      (
        await owner
          .get(`/v1/organizations/${orgId}/installations/${installation.id}`)
          .expect(200)
      ).body,
    ).toEqual({
      id: installation.id,
      organizationId: orgId,
      provider: 'github',
      externalId: '77',
      account: { login: 'acme', type: 'Organization' },
      repositorySelection: 'selected',
      status: 'active',
      createdBy: 'user-1',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      version: 1,
    });
    const repositories = await owner
      .get(`/v1/organizations/${orgId}/repositories`)
      .expect(200);
    expect(
      repositories.body.items.map(
        (r: { fullName: string; defaultBranch: string }) => [
          r.fullName,
          r.defaultBranch,
        ],
      ),
    ).toEqual([
      ['acme/api', 'main'],
      ['acme/web', 'trunk'],
    ]);

    const [event] = await outboxEvents(app);
    expect(event).toMatchObject({
      eventType: 'git.installation-changed',
      organizationId: orgId,
      actor: { sub: 'user-1' },
      payload: {
        installationId: installation.id,
        externalId: '77',
        status: 'active',
        repositoriesAdded: [
          { repositoryId: expect.any(String), fullName: 'acme/api' },
          { repositoryId: expect.any(String), fullName: 'acme/web' },
        ],
        repositoriesRemoved: [],
      },
    });
  });

  it('refuses a setup it can not trust', async () => {
    github.addInstallation('77', [API]);
    github.addInstallation('88', [WEB]);
    github.codes.set('code-77', ['77']);
    const back = (res: { headers: Record<string, string> }) =>
      new URL(res.headers.location).searchParams.get('reason');

    // No state, or a made-up one.
    expect(back(await setup({ installation_id: '77', code: 'code-77' }))).toBe(
      'expired',
    );
    expect(
      back(
        await setup({ installation_id: '77', code: 'code-77', state: 'nope' }),
      ),
    ).toBe('expired');
    // Someone else's installation: the person's own GitHub authorization says no.
    let state = await start(orgId, { returnTo: '/orgs/settings' });
    const res = await setup({ installation_id: '88', code: 'code-77', state });
    expect(res.headers.location).toBe(
      'https://iris.test/orgs/settings?github=failed&reason=not-allowed',
    );
    // A state works once.
    expect(
      back(await setup({ installation_id: '77', code: 'code-77', state })),
    ).toBe('expired');
    // Without GitHub's code.
    state = await start();
    expect(back(await setup({ installation_id: '77', state }))).toBe(
      'incomplete',
    );

    // Another organization's installation.
    await connected();
    const other = polis.organization();
    github.codes.set('code-again', ['77']);
    state = await start(other);
    expect(
      back(await setup({ installation_id: '77', code: 'code-again', state })),
    ).toBe('installation-taken');
    const otherOwner = await asMember(app, other, ['owner']);
    expect(
      (
        await otherOwner
          .get(`/v1/organizations/${other}/installations`)
          .expect(200)
      ).body.items,
    ).toEqual([]);
  });

  it('needs org:manage to connect, and an active organization', async () => {
    const member = await asMember(app, orgId, ['member']);
    await member
      .post(`/v1/organizations/${orgId}/github/connect`)
      .send({})
      .expect(403);
    await member.get(`/v1/organizations/${orgId}/installations`).expect(200);
    await http()
      .post(`/v1/organizations/${orgId}/github/connect`)
      .send({})
      .expect(401);

    const suspended = polis.organization('suspended');
    const res = await (
      await asMember(app, suspended, ['owner'])
    )
      .post(`/v1/organizations/${suspended}/github/connect`)
      .send({})
      .expect(409);
    expect(res.body.code).toBe('ORGANIZATION_SUSPENDED');
    await (
      await asMember(app, orgId, ['owner'])
    )
      .post(`/v1/organizations/${orgId}/github/connect`)
      .send({ returnTo: 'https://evil.example' })
      .expect(400);
  });

  it('links repositories to projects', async () => {
    const { api } = await connected();
    const linked = await link(api.id);
    const base = `/v1/organizations/${orgId}/projects/${projectId}/repositories`;

    const viewer = await asMember(app, orgId, ['member'], {
      projectRoles: { [projectId]: 'viewer' },
    });
    const list = await viewer.get(base).expect(200);
    expect(list.body.items).toEqual([
      {
        id: linked.id,
        organizationId: orgId,
        projectId,
        repository: expect.objectContaining({
          fullName: 'acme/api',
          status: 'available',
        }),
        createdBy: 'user-1',
        createdAt: expect.any(String),
      },
    ]);
    // Project admins only (organization owners and admins).
    await viewer.post(base).send({ repositoryId: api.id }).expect(403);

    const owner = await asMember(app, orgId, ['owner']);
    const again = await owner
      .post(base)
      .send({ repositoryId: api.id })
      .expect(409);
    expect(again.body.code).toBe('REPOSITORY_ALREADY_LINKED');
    // Unknown and archived projects (Polis).
    const unknown = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    await owner
      .post(`/v1/organizations/${orgId}/projects/${unknown}/repositories`)
      .send({ repositoryId: api.id })
      .expect(404);
    const archived = polis.project(orgId, 'archived');
    const res = await owner
      .post(`/v1/organizations/${orgId}/projects/${archived}/repositories`)
      .send({ repositoryId: api.id })
      .expect(409);
    expect(res.body.code).toBe('PROJECT_ARCHIVED');

    await owner.delete(`${base}/${linked.id}`).expect(204);
    await owner.get(`${base}/${linked.id}`).expect(404);
    expect((await outboxEvents(app)).map((e) => e.eventType)).toEqual([
      'git.installation-changed',
      'git.repository-linked',
      'git.repository-unlinked',
    ]);
  });

  it('gives a task a token for one repository, read or write', async () => {
    const { api, web } = await connected();
    const linked = await link(api.id);
    const tokens = `/v1/organizations/${orgId}/projects/${projectId}/repositories/${linked.id}/tokens`;

    const task = await asTask(app, orgId, projectId);
    const read = await task.post(tokens).send({ access: 'read' }).expect(201);
    expect(read.body).toEqual({
      token: expect.stringMatching(/^ghs_/),
      expiresAt: expect.any(String),
      access: 'read',
      repository: {
        fullName: 'acme/api',
        cloneUrl: `${github.url}/acme/api.git`,
        defaultBranch: 'main',
        apiUrl: `${github.url}/api/v3`,
      },
      // The app's bot, as GitHub shows its commits.
      committer: {
        name: 'aether-os-test[bot]',
        email: '4242+aether-os-test[bot]@users.noreply.127.0.0.1',
      },
    });
    await task.post(tokens).send({ access: 'write' }).expect(201);
    // Narrowed to the repository and the access (never workflows).
    expect(github.tokenRequests.filter((r) => r.body.repository_ids)).toEqual([
      {
        installationId: '77',
        body: {
          repository_ids: [1001],
          permissions: { contents: 'read', metadata: 'read' },
        },
      },
      {
        installationId: '77',
        body: {
          repository_ids: [1001],
          permissions: {
            contents: 'write',
            pull_requests: 'write',
            metadata: 'read',
          },
        },
      },
    ]);

    // People don't get tokens, even with the role; nor do viewers' tasks or other projects' tasks.
    const editor = await asMember(app, orgId, ['member'], {
      projectRoles: { [projectId]: 'editor' },
    });
    await editor.post(tokens).send({ access: 'read' }).expect(403);
    await (
      await asTask(app, orgId, projectId, 'viewer')
    )
      .post(tokens)
      .send({ access: 'read' })
      .expect(403);
    const other = polis.project(orgId);
    await (
      await asTask(app, orgId, other)
    )
      .post(tokens)
      .send({ access: 'read' })
      .expect(404);
    // Only linked repositories: web isn't linked here.
    expect(web).toBeDefined();
  });

  it('keeps installations in step with webhooks', async () => {
    const { installation, api } = await connected();
    const linked = await link(api.id);
    const task = await asTask(app, orgId, projectId);
    const tokens = `/v1/organizations/${orgId}/projects/${projectId}/repositories/${linked.id}/tokens`;

    // Unsigned or wrongly signed deliveries are refused.
    await deliver(
      'installation_repositories',
      { installation: { id: 77 } },
      'wrong',
    ).expect(401);
    await http().post('/v1/webhooks/github').send({}).expect(401);

    // acme/api removed from the installation: its link goes with it.
    github.installations.get('77')!.repositories = [WEB];
    const removed = { action: 'removed', installation: { id: 77 } };
    await deliver('installation_repositories', removed).expect(202);
    const owner = await asMember(app, orgId, ['owner']);
    await owner
      .get(
        `/v1/organizations/${orgId}/projects/${projectId}/repositories/${linked.id}`,
      )
      .expect(404);
    const res = await task.post(tokens).send({ access: 'read' }).expect(404);
    expect(res.body.status).toBe(404);
    const events = (await outboxEvents(app)).slice(-2);
    expect(events.map((e) => [e.eventType, e.payload])).toEqual([
      [
        'git.installation-changed',
        expect.objectContaining({
          repositoriesAdded: [],
          repositoriesRemoved: [{ repositoryId: api.id, fullName: 'acme/api' }],
        }),
      ],
      [
        'git.repository-unlinked',
        expect.objectContaining({ reason: 'repository-removed' }),
      ],
    ]);

    // Back again (a sync, as after a missed webhook), linked again, then suspended.
    github.installations.get('77')!.repositories = [API, WEB];
    await owner
      .post(`/v1/organizations/${orgId}/installations/${installation.id}/sync`)
      .expect(200);
    const relinked = await link(api.id);
    await deliver('installation', {
      action: 'suspend',
      installation: { id: 77 },
    }).expect(202);
    const suspended = await task
      .post(
        `/v1/organizations/${orgId}/projects/${projectId}/repositories/${relinked.id}/tokens`,
      )
      .send({ access: 'read' })
      .expect(409);
    expect(suspended.body.code).toBe('INSTALLATION_NOT_ACTIVE');

    // Uninstalled: deleted, nothing left available.
    const count = (await outboxEvents(app)).length;
    await deliver('installation', {
      action: 'deleted',
      installation: { id: 77 },
    }).expect(202);
    expect(
      (
        await owner
          .get(`/v1/organizations/${orgId}/installations/${installation.id}`)
          .expect(200)
      ).body.status,
    ).toBe('deleted');
    expect(
      (await owner.get(`/v1/organizations/${orgId}/repositories`).expect(200))
        .body.items,
    ).toEqual([]);
    expect((await outboxEvents(app)).length).toBeGreaterThan(count);
  });

  it('handles a redelivered webhook once, and keeps unknown installations out', async () => {
    await connected();
    github.installations.get('77')!.repositories = [API];
    const body = Buffer.from(
      JSON.stringify({ action: 'removed', installation: { id: 77 } }),
    );
    const send = () =>
      http()
        .post('/v1/webhooks/github')
        .set('content-type', 'application/json')
        .set('x-github-event', 'installation_repositories')
        .set('x-github-delivery', 'the-same-delivery')
        .set('x-hub-signature-256', webhookSignature(WEBHOOK_SECRET, body))
        .send(body.toString())
        .expect(202);
    await send();
    const after = (await outboxEvents(app)).length;
    // GitHub restored acme/web in between; a redelivery must not resync.
    github.installations.get('77')!.repositories = [API, WEB];
    await send();
    expect((await outboxEvents(app)).length).toBe(after);

    // An installation no organization connected: stored, nothing else.
    await deliver('installation', {
      action: 'created',
      installation: { id: 99 },
    }).expect(202);
    expect((await outboxEvents(app)).length).toBe(after);
  });

  it('follows pull requests on connected repositories', async () => {
    const { api } = await connected();
    const pr = (overrides: object = {}) => ({
      action: 'opened',
      installation: { id: 77 },
      repository: { id: 1001, full_name: 'acme/api' },
      sender: { login: 'aether-os-test[bot]', type: 'Bot' },
      pull_request: {
        number: 12,
        html_url: 'https://github.com/acme/api/pull/12',
        state: 'open',
        merged: false,
        merged_at: null,
        head: { ref: 'aether/0193', sha: 'abc123' },
        base: { ref: 'main' },
        ...overrides,
      },
    });
    const updates = async () =>
      (await outboxEvents(app)).filter(
        (e) => e.eventType === 'git.pull-request.updated',
      );

    await deliver('pull_request', pr()).expect(202);
    await deliver('pull_request', {
      ...pr({
        state: 'closed',
        merged: true,
        merged_at: '2026-11-18T12:00:00Z',
        head: { ref: 'aether/0193', sha: 'def456' },
      }),
      action: 'closed',
      sender: { login: 'ada', type: 'User' },
    }).expect(202);
    // Another repository, not connected: nothing.
    await deliver('pull_request', { ...pr(), repository: { id: 9999 } }).expect(
      202,
    );

    const events = await updates();
    expect(events.map((e) => [e.aggregateVersion, e.payload])).toEqual([
      [
        1,
        {
          repositoryId: api.id,
          repository: 'acme/api',
          number: 12,
          url: 'https://github.com/acme/api/pull/12',
          state: 'open',
          branch: 'aether/0193',
          baseBranch: 'main',
          headSha: 'abc123',
          mergedAt: null,
          fromAetherOs: true,
        },
      ],
      [
        2,
        expect.objectContaining({
          state: 'merged',
          headSha: 'def456',
          mergedAt: '2026-11-18T12:00:00.000Z',
          fromAetherOs: false,
        }),
      ],
    ]);
    expect(events[0].aggregateId).toBe(events[1].aggregateId);
    expect(events[0].organizationId).toBe(orgId);
  });
});
