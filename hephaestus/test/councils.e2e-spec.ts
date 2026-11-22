import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';

import { CouncilsService } from '@hephaestus/councils';
import { EventInbox, type DomainEvent } from '@hephaestus/core';

import { createApp } from './app.js';
import type { FakePolis } from './fake-polis.js';

describe('Councils from Agora (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let orgId: string;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    orgId = polis.organization();
  });

  afterEach(async () => {
    await app.close();
  });

  const event = (
    eventType: string,
    aggregateId: string,
    aggregateVersion: number,
    payload: object,
  ): DomainEvent =>
    ({
      eventId: uuidv7(),
      eventType,
      schemaVersion: 1,
      aggregateId,
      aggregateVersion,
      occurredAt: new Date(),
      organizationId: orgId,
      projectId: null,
      actor: null,
      payload,
    }) as DomainEvent;
  const deliver = (e: DomainEvent) => app.get(EventInbox).receive('agora', e);
  const version = (councilId: string, id: string, number: number) => ({
    id,
    councilId,
    organizationId: orgId,
    version: number,
    status: 'published',
    facilitator: { agentId: uuidv7() },
    members: [{ agentId: uuidv7(), participation: 'required' }],
    settings: {
      defaultMode: 'facilitated',
      allowDirectInteraction: true,
      allowDiscussion: true,
      allowPlanning: true,
      allowDelegation: false,
      requireSynthesis: true,
    },
    discussion: {
      maxRounds: 3,
      allowAgentResponses: true,
      requireFacilitatorConclusion: true,
    },
    createdBy: 'user-1',
    createdAt: new Date().toISOString(),
    publishedAt: new Date().toISOString(),
  });

  it('keeps councils and their published versions from Agora’s events', async () => {
    const councils = app.get(CouncilsService);
    const councilId = uuidv7();
    const first = uuidv7();
    const second = uuidv7();

    // A version before its council: retried until council.created is in.
    await expect(
      deliver(
        event('council-version.published', councilId, 2, {
          councilId,
          councilVersionId: first,
          previousVersionId: null,
          version: version(councilId, first, 1),
        }),
      ),
    ).rejects.toThrow("isn't in Hephaestus's copy yet");

    await deliver(
      event('council.created', councilId, 1, {
        councilId,
        key: 'architecture',
        name: 'Architecture',
        description: '',
        createdBy: 'user-1',
        createdAt: new Date().toISOString(),
      }),
    );
    await expect(councils.publishedVersion(orgId, councilId)).rejects.toThrow(
      'has no published version',
    );
    await deliver(
      event('council-version.published', councilId, 2, {
        councilId,
        councilVersionId: first,
        previousVersionId: null,
        version: version(councilId, first, 1),
      }),
    );
    expect(await councils.publishedVersion(orgId, councilId)).toMatchObject({
      id: first,
      version: 1,
    });

    await deliver(
      event('council-version.published', councilId, 3, {
        councilId,
        councilVersionId: second,
        previousVersionId: first,
        version: version(councilId, second, 2),
      }),
    );
    await deliver(
      event('council-version.deprecated', councilId, 4, {
        councilId,
        councilVersionId: first,
      }),
    );
    expect(await councils.publishedVersion(orgId, councilId)).toMatchObject({
      id: second,
      status: 'published',
    });

    // Another organization's council is unknown; an archived one can't be used.
    await expect(
      councils.publishedVersion(polis.organization(), councilId),
    ).rejects.toThrow('not found');
    await deliver(event('council.archived', councilId, 5, { councilId }));
    await expect(councils.publishedVersion(orgId, councilId)).rejects.toThrow(
      'is archived',
    );
  });
});
