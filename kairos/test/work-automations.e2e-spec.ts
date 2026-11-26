import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import type { WorkItem } from '@kairos/automations';
import { EventInbox, type DomainEvent } from '@kairos/core';

import { asMember, createApp, type Client } from './app.js';
import type { FakeErgon } from './fake-ergon.js';
import type { FakePolis } from './fake-polis.js';

const AGENT = '0193a1b2-c3d4-7e5f-8a9b-0000000000a1';
const OTHER_AGENT = '0193a1b2-c3d4-7e5f-8a9b-0000000000a9';
const SERVICE_ACCOUNT = '0193a1b2-c3d4-7e5f-8a9b-0000000000a2';
const LINK = '0193a1b2-c3d4-7e5f-8a9b-0000000000a4';
const DEPARTMENT = '0193a1b2-c3d4-7e5f-8a9b-0000000000d1';

describe('Work automations (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let ergon: FakeErgon;
  let orgId: string;
  let projectId: string;
  let owner: Client;

  beforeEach(async () => {
    ({ app, polis, ergon } = await createApp());
    orgId = polis.organization();
    projectId = polis.project(orgId);
    owner = await asMember(app, orgId, ['owner']);
  });

  afterEach(async () => {
    await app.close();
  });

  const automations = () =>
    `/v1/organizations/${orgId}/projects/${projectId}/automations`;

  const create = async (trigger: Record<string, unknown> = {}) =>
    (
      await owner
        .post(automations())
        .send({
          name: 'Agents do their work',
          trigger: { type: 'ergon.work-assigned', ...trigger },
          action: {
            serviceAccountId: SERVICE_ACCOUNT,
            reviewArtifactKinds: ['text'],
            concurrency: { key: '{{workItem.id}}', policy: 'queue' },
          },
        })
        .expect(201)
    ).body as { id: string; trigger: Record<string, unknown> };

  const workItem = (overrides: Partial<WorkItem> = {}): WorkItem => {
    const item = {
      id: uuidv7(),
      organizationId: orgId,
      projectId,
      parentId: null,
      departmentId: DEPARTMENT,
      teamId: null,
      type: 'task',
      title: 'Write the quarterly report',
      description: 'For the board meeting.',
      status: 'todo',
      blocked: false,
      priority: 'high',
      needsReview: true,
      requirements: [{ key: 'REQ-1', description: 'Totals add up' }],
      expectedOutcome: 'A report in Markdown.',
      constraints: [],
      acceptanceCriteria: [{ key: 'AC-1', description: 'Finance signs off' }],
      dueAt: null,
      startedAt: null,
      completedAt: null,
      source: { kind: 'person', reference: null },
      responsible: { kind: 'agent', id: AGENT, versionId: null },
      createdBy: {
        sub: 'user-1',
        subType: 'user',
        agentId: null,
        agentVersionId: null,
        taskId: null,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 3,
      ...overrides,
    } as WorkItem;
    ergon.workItems.set(item.id, item);
    return item;
  };

  /** Ergon's `work-assignment.changed`, through Kairos's inbox. */
  const assigned = (
    item: WorkItem,
    overrides: Record<string, unknown> = {},
    eventProjectId: string | null = projectId,
  ): DomainEvent => ({
    eventId: uuidv7(),
    eventType: 'work-assignment.changed',
    schemaVersion: 1,
    aggregateId: uuidv7(),
    aggregateVersion: 1,
    occurredAt: new Date(),
    organizationId: orgId,
    projectId: eventProjectId,
    actor: { sub: 'user-1', sub_type: 'user' },
    payload: {
      change: 'started',
      assignmentId: uuidv7(),
      workItemId: item.id,
      workItemTitle: item.title,
      assignee: { kind: 'agent', id: AGENT, versionId: null },
      role: 'responsible',
      reason: null,
      ...overrides,
    },
  });

  const deliver = (event: DomainEvent) =>
    app.get(EventInbox).receive('ergon', event);

  const outbox = async (exchange: string) =>
    (
      (await app
        .get(DataSource)
        .query(
          'SELECT message FROM outbox WHERE exchange = $1 ORDER BY created_at, id',
          [exchange],
        )) as { message: DomainEvent<Record<string, unknown>> }[]
    ).map((row) => row.message);

  const runs = async (automationId: string) =>
    (await owner.get(`${automations()}/${automationId}/runs`).expect(200)).body
      .items as Record<string, unknown>[];

  it('starts the assigned agent on the work item, with its work context', async () => {
    const automation = await create({ repositoryLinkId: LINK });
    expect(automation.trigger).toEqual({
      type: 'ergon.work-assigned',
      agentId: null,
      repositoryLinkId: LINK,
    });
    const item = workItem();
    const event = assigned(item);

    await deliver(event);
    await deliver({ ...event });

    const [run] = await runs(automation.id);
    expect(await runs(automation.id)).toHaveLength(1);
    expect(run).toMatchObject({
      status: 'requested',
      event: {
        eventId: event.eventId,
        type: 'ergon.work-assigned',
        workItemId: item.id,
        agentId: AGENT,
        title: item.title,
      },
    });
    const commands = await outbox('hephaestus.commands');
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      eventId: run.id,
      eventType: 'task.create',
      organizationId: orgId,
      projectId,
      payload: {
        automationId: automation.id,
        task: {
          agentId: AGENT,
          serviceAccountId: SERVICE_ACCOUNT,
          title: item.title,
          description: item.description,
          requirements: item.requirements,
          expectedOutcome: item.expectedOutcome,
          acceptanceCriteria: [
            {
              key: 'AC-1',
              description: 'Finance signs off',
              check: { type: 'manual' },
            },
          ],
          repository: { linkId: LINK },
          review: { artifactKinds: ['text'] },
          concurrency: {
            key: `${automation.id}:${item.id}`,
            policy: 'queue',
          },
          workContext: {
            workItemId: item.id,
            organizationId: orgId,
            agentId: AGENT,
            departmentId: DEPARTMENT,
            teamId: null,
          },
        },
      },
    });
    const [triggered] = await outbox('kairos.events');
    expect(triggered.payload).toMatchObject({
      automationId: automation.id,
      runId: run.id,
      triggerType: 'ergon.work-assigned',
      sourceEventId: event.eventId,
      webhookDeliveryId: null,
    });
  });

  it('fires only for an agent made responsible in the project, and its own agent', async () => {
    const mine = await create({ agentId: OTHER_AGENT });
    const item = workItem();
    await deliver(assigned(item));
    await deliver(assigned(item, { role: 'reviewer' }));
    await deliver(assigned(item, { change: 'ended' }));
    await deliver(
      assigned(item, {
        assignee: { kind: 'person', id: uuidv7(), versionId: null },
      }),
    );
    await deliver(assigned(item, {}, polis.project(orgId)));
    await deliver(assigned(item, {}, null));
    expect(await runs(mine.id)).toEqual([]);
    expect(ergon.reads).toEqual([]);
    expect(await outbox('hephaestus.commands')).toEqual([]);
  });

  it("skips work that's finished or reassigned by the time Kairos reads it", async () => {
    const automation = await create();
    const done = workItem({ status: 'done' });
    const moved = workItem({
      responsible: { kind: 'agent', id: OTHER_AGENT, versionId: null },
    });
    await deliver(assigned(done));
    await deliver(assigned(moved));
    await deliver(assigned({ ...done, id: uuidv7() }));

    const skipped = await runs(automation.id);
    expect(
      skipped.map((run) => [
        run.status,
        (run.rejection as { code: string }).code,
      ]),
    ).toEqual([
      ['skipped', 'WORK_ITEM_NOT_FOUND'],
      ['skipped', 'WORK_ITEM_REASSIGNED'],
      ['skipped', 'WORK_ITEM_CLOSED'],
    ]);
    expect(await outbox('hephaestus.commands')).toEqual([]);
  });

  it('leaves the event for a retry while Ergon is down', async () => {
    const automation = await create();
    const item = workItem();
    const event = assigned(item);
    ergon.down = true;
    await expect(deliver(event)).rejects.toThrow();
    expect(await runs(automation.id)).toEqual([]);
    ergon.down = false;
    await deliver(event);
    expect(await runs(automation.id)).toHaveLength(1);
  });

  it('refuses a task or template, or issue fields, on a work trigger', async () => {
    const res = await owner
      .post(automations())
      .send({
        name: 'Confused',
        trigger: { type: 'ergon.work-assigned' },
        action: {
          serviceAccountId: SERVICE_ACCOUNT,
          task: { agentId: AGENT, title: 'Do it', instructions: 'Now' },
          concurrency: { key: '{{issue.number}}', policy: 'queue' },
        },
      })
      .expect(400);
    expect(
      res.body.errors.map((error: { pointer: string }) => error.pointer),
    ).toEqual(['/action', '/action/concurrency/key']);
  });
});
