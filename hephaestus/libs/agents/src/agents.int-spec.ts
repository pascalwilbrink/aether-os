import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { v7 as uuidv7 } from 'uuid';

import {
  archiveAgent,
  createAgent,
  deliverAgoraEvent,
  publishVersion,
} from '../../../test/agora.js';
import type { FakePolis } from '../../../test/fake-polis.js';
import { createTestingModule } from '../../../test/testing-module.js';
import { AgentVersionsService } from './agent-versions.service.js';
import { AgentsModule } from './agents.module.js';
import { AgentsService } from './agents.service.js';

describe("Hephaestus's copy of Agora's agents (Postgres)", () => {
  let moduleRef: TestingModule;
  let agents: AgentsService;
  let versions: AgentVersionsService;
  let polis: FakePolis;
  let orgId: string;

  beforeEach(async () => {
    ({ moduleRef, polis } = await createTestingModule(AgentsModule));
    agents = moduleRef.get(AgentsService);
    versions = moduleRef.get(AgentVersionsService);
    orgId = polis.organization();
  });

  afterEach(async () => {
    await moduleRef.close();
  });

  it('keeps agents and the version they publish, scoped to their organization', async () => {
    const agentId = await createAgent(moduleRef, orgId);
    await agents.assertExists(orgId, agentId);
    await expect(agents.publishedVersion(orgId, agentId)).rejects.toMatchObject(
      { code: 'AGENT_NOT_PUBLISHED' },
    );

    const v1 = await publishVersion(moduleRef, orgId, agentId, {
      aggregateVersion: 2,
      instructions: 'Fix bugs.',
      model: { provider: 'anthropic', model: 'claude', temperature: 0.2 },
    });

    await expect(agents.publishedVersion(orgId, agentId)).resolves.toBe(v1);
    await expect(versions.findById(orgId, agentId, v1)).resolves.toMatchObject({
      id: v1,
      agentId,
      organizationId: orgId,
      status: 'published',
      instructions: 'Fix bugs.',
      model: { provider: 'anthropic', model: 'claude', temperature: 0.2 },
    });

    const other = polis.organization();
    await expect(agents.assertExists(other, agentId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(versions.findById(other, agentId, v1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('moves to each newly published version and keeps the replaced one runnable', async () => {
    const agentId = await createAgent(moduleRef, orgId);
    const v1 = await publishVersion(moduleRef, orgId, agentId, {
      aggregateVersion: 2,
    });
    const v2 = await publishVersion(moduleRef, orgId, agentId, {
      aggregateVersion: 3,
      version: 2,
      previousVersionId: v1,
    });

    await expect(agents.publishedVersion(orgId, agentId)).resolves.toBe(v2);
    await expect(versions.findById(orgId, agentId, v1)).resolves.toMatchObject({
      status: 'deprecated',
    });
  });

  it('never moves backwards on late or repeated events', async () => {
    const agentId = await createAgent(moduleRef, orgId);
    // Version 2 was published after version 1, but its event comes first.
    const v2 = await publishVersion(moduleRef, orgId, agentId, {
      aggregateVersion: 3,
      version: 2,
    });
    const v1 = await publishVersion(moduleRef, orgId, agentId, {
      aggregateVersion: 2,
    });

    await expect(agents.publishedVersion(orgId, agentId)).resolves.toBe(v2);
    // The late version is still kept, for a task that may have pinned it.
    await expect(versions.findById(orgId, agentId, v1)).resolves.toMatchObject({
      status: 'deprecated',
    });

    // agent.created again changes nothing.
    await createAgent(moduleRef, orgId, { agentId, name: 'Renamed' });
    await expect(agents.publishedVersion(orgId, agentId)).resolves.toBe(v2);

    await archiveAgent(moduleRef, orgId, agentId, 4);
    await expect(agents.publishedVersion(orgId, agentId)).rejects.toMatchObject(
      { code: 'AGENT_ARCHIVED' },
    );
    // An older version event doesn't bring it back.
    await publishVersion(moduleRef, orgId, agentId, { aggregateVersion: 3 });
    await expect(agents.publishedVersion(orgId, agentId)).rejects.toMatchObject(
      { code: 'AGENT_ARCHIVED' },
    );
  });

  it('retries events about an agent it has not heard of yet', async () => {
    const agentId = uuidv7();

    await expect(
      publishVersion(moduleRef, orgId, agentId, { aggregateVersion: 2 }),
    ).rejects.toThrow(/isn't in Hephaestus's copy yet/);
    await expect(
      deliverAgoraEvent(moduleRef, {
        eventType: 'agent.archived',
        aggregateId: agentId,
        aggregateVersion: 3,
        organizationId: orgId,
        payload: { agentId },
      }),
    ).rejects.toThrow(/isn't in Hephaestus's copy yet/);

    // Once agent.created is in, the version applies (the consumer's retry).
    await createAgent(moduleRef, orgId, { agentId });
    const v1 = await publishVersion(moduleRef, orgId, agentId, {
      aggregateVersion: 2,
    });
    await expect(agents.publishedVersion(orgId, agentId)).resolves.toBe(v1);
  });
});
