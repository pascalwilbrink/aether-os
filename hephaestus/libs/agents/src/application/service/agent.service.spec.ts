import { NotFoundException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { AgentId, AgentVersionId, OrganizationId } from '@hephaestus/core';
import {
  OrganizationService,
  OrganizationSuspendedError,
} from '@hephaestus/organizations';

import { AgentsModule } from '../../agents.module.js';
import { AgentVersionRepository } from '../../domain/repository/agent-version.repository.js';
import { AgentRepository } from '../../domain/repository/agent.repository.js';
import { AgentService } from './agent.service.js';

const orgId = 'org-1' as OrganizationId;
const otherOrgId = 'org-2' as OrganizationId;
const agentId = 'agent-1' as AgentId;

function versionInput(id: string) {
  return {
    id: id as AgentVersionId,
    agentId,
    organizationId: orgId,
    instructions: 'Be helpful.',
    model: {
      provider: 'anthropic',
      model: 'claude-opus-5-5',
      temperature: 0.2,
    },
    capabilities: ['chat'],
    tools: [{ name: 'search', enabled: true, configuration: { depth: 2 } }],
    skills: [{ name: 'summarize', version: '1.0.0', enabled: true }],
    runtime: {
      provider: 'local',
      executionMode: 'standard' as const,
      sandboxRequired: false,
    },
    createdBy: 'user-1',
  };
}

describe('AgentService (sqlite)', () => {
  let moduleRef: TestingModule;
  let service: AgentService;
  let organizations: OrganizationService;

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'better-sqlite3',
          database: ':memory:',
          autoLoadEntities: true,
          synchronize: true,
        }),
        AgentsModule,
      ],
    }).compile();

    service = moduleRef.get(AgentService);
    organizations = moduleRef.get(OrganizationService);

    for (const [id, slug] of [
      [orgId, 'org-one'],
      [otherOrgId, 'org-two'],
    ] as const) {
      await organizations.create({ id, name: slug, slug, createdBy: 'user-1' });
    }

    await service.create({
      id: agentId,
      organizationId: orgId,
      name: 'Helper',
      description: 'A helpful agent',
      createdBy: 'user-1',
    });
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('persists and loads an agent', async () => {
    const agent = await service.findById(orgId, agentId);

    expect(agent.name).toBe('Helper');
    expect(agent.status).toBe('active');
    expect(agent.latestVersionId).toBeNull();
    expect(agent.createdAt).toBeInstanceOf(Date);
  });

  it('scopes lookups to the organization', async () => {
    await expect(service.findById(otherOrgId, agentId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s for an unknown organization', async () => {
    const unknown = 'missing' as OrganizationId;

    await expect(
      service.create({
        id: 'agent-x' as AgentId,
        organizationId: unknown,
        name: 'X',
        description: '',
        createdBy: 'user-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    await expect(
      service.list(unknown, { limit: 10, offset: 0 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('blocks writes but allows reads for a suspended organization', async () => {
    const v1 = await service.createVersion(versionInput('v-1'));
    await organizations.suspend(orgId);

    await expect(
      service.create({
        id: 'agent-x' as AgentId,
        organizationId: orgId,
        name: 'X',
        description: '',
        createdBy: 'user-1',
      }),
    ).rejects.toBeInstanceOf(OrganizationSuspendedError);
    await expect(
      service.createVersion(versionInput('v-2')),
    ).rejects.toBeInstanceOf(OrganizationSuspendedError);
    await expect(
      service.publishVersion(orgId, agentId, v1.id),
    ).rejects.toBeInstanceOf(OrganizationSuspendedError);
    await expect(service.archive(orgId, agentId)).rejects.toBeInstanceOf(
      OrganizationSuspendedError,
    );

    await expect(service.findById(orgId, agentId)).resolves.toMatchObject({
      status: 'active',
    });
    await expect(
      service.listVersions(orgId, agentId, { limit: 10, offset: 0 }),
    ).resolves.toMatchObject({ total: 1 });
    await expect(
      service.findVersionById(orgId, agentId, v1.id),
    ).resolves.toMatchObject({ status: 'draft' });

    await organizations.activate(orgId);
    await expect(
      service.publishVersion(orgId, agentId, v1.id),
    ).resolves.toMatchObject({ status: 'published' });
  });

  it('numbers versions sequentially and round-trips JSON config', async () => {
    const v1 = await service.createVersion(versionInput('v-1'));
    const v2 = await service.createVersion(versionInput('v-2'));

    expect(v1.version).toBe(1);
    expect(v2.version).toBe(2);

    const published = await service.publishVersion(orgId, agentId, v2.id);

    expect(published.status).toBe('published');
    expect(published.tools).toEqual(versionInput('x').tools);
    expect(published.model).toEqual(versionInput('x').model);

    const agent = await service.findById(orgId, agentId);
    expect(agent.latestVersionId).toBe(v2.id);
  });

  it('assigns distinct numbers to concurrently created versions', async () => {
    const versions = await Promise.all([
      service.createVersion(versionInput('v-1')),
      service.createVersion(versionInput('v-2')),
      service.createVersion(versionInput('v-3')),
    ]);

    expect(versions.map((v) => v.version).sort((a, b) => a - b)).toEqual([
      1, 2, 3,
    ]);
  });

  it('rolls back the whole publish when saving the agent fails', async () => {
    const v1 = await service.createVersion(versionInput('v-1'));
    const v2 = await service.createVersion(versionInput('v-2'));
    await service.publishVersion(orgId, agentId, v1.id);

    vi.spyOn(moduleRef.get(AgentRepository), 'save').mockRejectedValueOnce(
      new Error('agent save failed'),
    );

    await expect(service.publishVersion(orgId, agentId, v2.id)).rejects.toThrow(
      'agent save failed',
    );

    const versions = moduleRef.get(AgentVersionRepository);

    const storedV2 = await versions.findById(orgId, v2.id);
    expect(storedV2?.status).toBe('draft');
    expect(storedV2?.publishedAt).toBeNull();

    // The previous version's auto-deprecation is rolled back too.
    const storedV1 = await versions.findById(orgId, v1.id);
    expect(storedV1?.status).toBe('published');

    const agent = await service.findById(orgId, agentId);
    expect(agent.latestVersionId).toBe(v1.id);
  });

  it('lists agents per organization with pagination', async () => {
    for (const n of [2, 3]) {
      await service.create({
        id: `agent-${n}` as AgentId,
        organizationId: orgId,
        name: `Agent ${n}`,
        description: '',
        createdBy: 'user-1',
      });
    }
    await service.create({
      id: 'agent-other' as AgentId,
      organizationId: otherOrgId,
      name: 'Other',
      description: '',
      createdBy: 'user-1',
    });

    const first = await service.list(orgId, { limit: 2, offset: 0 });
    const second = await service.list(orgId, { limit: 2, offset: 2 });

    expect(first.total).toBe(3);
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);

    const ids = [...first.items, ...second.items].map((a) => a.id).sort();
    expect(ids).toEqual(['agent-1', 'agent-2', 'agent-3']);
  });

  it('lists versions newest first', async () => {
    for (const id of ['v-1', 'v-2', 'v-3']) {
      await service.createVersion(versionInput(id));
    }

    const page = await service.listVersions(orgId, agentId, {
      limit: 2,
      offset: 0,
    });

    expect(page.total).toBe(3);
    expect(page.items.map((v) => v.version)).toEqual([3, 2]);
  });

  it('404s when listing versions of an unknown agent', async () => {
    await expect(
      service.listVersions(orgId, 'missing' as AgentId, {
        limit: 10,
        offset: 0,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('only finds a version under its own agent', async () => {
    const version = await service.createVersion(versionInput('v-1'));

    await expect(
      service.findVersionById(orgId, agentId, version.id),
    ).resolves.toMatchObject({ version: 1 });

    await expect(
      service.findVersionById(orgId, 'agent-x' as AgentId, version.id),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('deprecates the previous latest version when publishing a new one', async () => {
    const v1 = await service.createVersion(versionInput('v-1'));
    const v2 = await service.createVersion(versionInput('v-2'));
    await service.publishVersion(orgId, agentId, v1.id);
    await service.publishVersion(orgId, agentId, v2.id);

    await expect(
      service.findVersionById(orgId, agentId, v1.id),
    ).resolves.toMatchObject({ status: 'deprecated' });
    await expect(
      service.findVersionById(orgId, agentId, v2.id),
    ).resolves.toMatchObject({ status: 'published' });

    const agent = await service.findById(orgId, agentId);
    expect(agent.latestVersionId).toBe(v2.id);
  });

  it('rejects versions for archived agents', async () => {
    await service.archive(orgId, agentId);

    await expect(service.createVersion(versionInput('v-1'))).rejects.toThrow(
      'archived',
    );
  });
});
