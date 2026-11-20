import type { INestApplication } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';

import { actingAs, testPrincipal } from '@aether-os/krepis/testing';
import { createApp } from '../../../test/app.js';
import type { FakePolis } from '../../../test/fake-polis.js';
import { AgentVersionsService } from './agent-versions.service.js';
import { AgentsService } from './agents.service.js';

const missing = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const versionBody = {
  instructions: 'Be helpful.',
  model: { provider: 'anthropic', model: 'claude', temperature: 0.2 },
  capabilities: ['chat'],
  tools: [{ name: 'search', enabled: false, tools: ['query'] }],
  skills: [{ name: 'summarize', version: '1', enabled: false }],
  runtime: {
    provider: 'local',
    executionMode: 'standard' as const,
    sandboxRequired: false,
  },
};

const caller = testPrincipal({
  sub: 'user-1',
  subType: 'user',
  organizationId: '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b',
  organizationRoles: ['owner'],
  scopes: [],
});

describe('AgentsService and AgentVersionsService (Postgres)', () => {
  let app: INestApplication;
  let agents: AgentsService;
  let versions: AgentVersionsService;
  let polis: FakePolis;
  let orgId: string;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    agents = actingAs(app.get(AgentsService), caller);
    versions = actingAs(app.get(AgentVersionsService), caller);
    orgId = polis.organization();
  });

  afterEach(async () => {
    await app.close();
  });

  const createAgent = (organizationId = orgId) =>
    agents.create(organizationId, {
      name: 'Helper',
      description: 'Helps',
    });

  it('creates agents, scoped to their organization', async () => {
    const agent = await createAgent();
    const other = { id: polis.organization() };

    await expect(agents.findById(orgId, agent.id)).resolves.toEqual(agent);
    await expect(agents.findById(other.id, agent.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(createAgent(missing)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('archives idempotently and then refuses new versions', async () => {
    const agent = await createAgent();

    const archived = await agents.archive(orgId, agent.id);
    expect(archived.status).toBe('archived');
    await expect(agents.archive(orgId, agent.id)).resolves.toEqual(archived);

    await expect(
      versions.create(orgId, agent.id, versionBody),
    ).rejects.toMatchObject({
      code: 'AGENT_ARCHIVED',
    });
  });

  it('numbers versions without gaps, even when created concurrently', async () => {
    const agent = await createAgent();

    const created = await Promise.all(
      Array.from({ length: 5 }, () =>
        versions.create(orgId, agent.id, versionBody),
      ),
    );

    expect(created.map((v) => v.version).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(created.every((v) => v.status === 'draft')).toBe(true);
    expect(created[0].tools).toEqual(versionBody.tools);
  });

  it('lists versions highest first, page by page', async () => {
    const agent = await createAgent();
    for (let i = 0; i < 3; i++) {
      await versions.create(orgId, agent.id, versionBody);
    }

    const first = await versions.list(orgId, agent.id, { limit: 2 });
    const rest = await versions.list(orgId, agent.id, {
      limit: 2,
      cursor: first.nextCursor,
    });

    expect([...first.items, ...rest.items].map((v) => v.version)).toEqual([
      3, 2, 1,
    ]);
    expect(rest.nextCursor).toBeNull();
    await expect(
      versions.list(orgId, missing, { limit: 2 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('publishes one version at a time', async () => {
    const agent = await createAgent();
    const v1 = await versions.create(orgId, agent.id, versionBody);
    const v2 = await versions.create(orgId, agent.id, versionBody);

    const published = await versions.publish(orgId, agent.id, v1.id);
    expect(published).toMatchObject({
      status: 'published',
      publishedAt: expect.any(String),
    });
    await expect(versions.publish(orgId, agent.id, v1.id)).resolves.toEqual(
      published,
    );
    await expect(agents.findById(orgId, agent.id)).resolves.toMatchObject({
      latestVersionId: v1.id,
    });

    await versions.publish(orgId, agent.id, v2.id);
    await expect(
      versions.findById(orgId, agent.id, v1.id),
    ).resolves.toMatchObject({
      status: 'deprecated',
    });
    await expect(agents.findById(orgId, agent.id)).resolves.toMatchObject({
      latestVersionId: v2.id,
    });

    await expect(
      versions.publish(orgId, agent.id, v1.id),
    ).rejects.toMatchObject({
      code: 'AGENT_VERSION_INVALID_TRANSITION',
    });
  });

  it('finds a version only under its own agent', async () => {
    const agent = await createAgent();
    const other = await createAgent();
    const version = await versions.create(orgId, agent.id, versionBody);

    await expect(
      versions.findById(orgId, other.id, version.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      versions.publish(orgId, other.id, version.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks writes, but not reads, while the organization is suspended', async () => {
    const agent = await createAgent();
    const version = await versions.create(orgId, agent.id, versionBody);
    polis.organizations.set(orgId, {
      id: orgId,
      status: 'suspended',
      version: 2,
    });

    for (const write of [
      () => createAgent(),
      () => agents.archive(orgId, agent.id),
      () => versions.create(orgId, agent.id, versionBody),
      () => versions.publish(orgId, agent.id, version.id),
    ]) {
      await expect(write()).rejects.toMatchObject({
        code: 'ORGANIZATION_SUSPENDED',
      });
    }
    await expect(
      versions.findById(orgId, agent.id, version.id),
    ).resolves.toEqual(version);
  });
});
