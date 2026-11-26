import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';

import { EventInbox, type DomainEvent } from '@ergon/core';

import { asMember, createApp, type Client } from './app.js';
import type { FakePolis } from './fake-polis.js';
import { outboxEvents } from './outbox.js';

const AGENT = '0193a1b2-c3d4-7e5f-8a9b-0000000000a1';
const AGENT_VERSION = '0193a1b2-c3d4-7e5f-8a9b-0000000000a2';
const ARTIFACT = '0193a1b2-c3d4-7e5f-8a9b-0000000000c1';

describe('Work executions (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let orgId: string;
  let projectId: string;
  let owner: Client;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    orgId = polis.organization();
    projectId = polis.project(orgId);
    owner = await asMember(app, orgId, ['owner']);
  });

  afterEach(async () => {
    await app.close();
  });

  const items = () => `/v1/organizations/${orgId}/work-items`;

  const create = async (overrides: Record<string, unknown> = {}) =>
    (
      await owner
        .post(items())
        .send({
          type: 'task',
          title: 'Write the report',
          projectId,
          ...overrides,
        })
        .expect(201)
    ).body as { id: string; status: string };

  const get = async (id: string) =>
    (await owner.get(`${items()}/${id}`).expect(200)).body;

  const executions = async (id: string) =>
    (await owner.get(`${items()}/${id}/executions`).expect(200)).body
      .items as Record<string, unknown>[];

  const activityKinds = async (id: string) =>
    (
      (await owner.get(`${items()}/${id}/activity`).expect(200)).body.items as {
        kind: string;
        actor: unknown;
        details: Record<string, unknown>;
      }[]
    ).map((entry) =>
      entry.kind === 'status_changed'
        ? `${entry.kind}:${entry.details.to as string}`
        : entry.kind,
    );

  /** One of Hephaestus's task events, through Ergon's inbox. */
  const taskEvent = (
    eventType: string,
    taskId: string,
    version: number,
    payload: Record<string, unknown>,
    organizationId = orgId,
  ) =>
    app.get(EventInbox).receive('hephaestus', {
      eventId: uuidv7(),
      eventType,
      schemaVersion: 1,
      aggregateId: taskId,
      aggregateVersion: version,
      occurredAt: new Date(),
      organizationId,
      projectId,
      actor: { sub: 'kairos', sub_type: 'service' },
      payload: { taskId, ...payload },
    } as DomainEvent);

  const taskCreated = (
    taskId: string,
    workItemId: string | null,
    organizationId = orgId,
  ) =>
    taskEvent(
      'task.created',
      taskId,
      1,
      {
        parentTaskId: null,
        topLevelTaskId: taskId,
        agentId: AGENT,
        agentVersionId: AGENT_VERSION,
        serviceAccountId: uuidv7(),
        requestedBy: 'kairos',
        idempotencyKey: uuidv7(),
        status: 'queued',
        taskTemplateId: null,
        taskTemplateVersion: null,
        workContext: workItemId
          ? {
              workItemId,
              organizationId,
              agentId: AGENT,
              departmentId: null,
              teamId: null,
            }
          : null,
      },
      organizationId,
    );

  const statusChanged = (
    taskId: string,
    version: number,
    from: string,
    to: string,
  ) =>
    taskEvent('task.status-changed', taskId, version, {
      from,
      to,
      reason: null,
    });

  const succeeded = (taskId: string, version: number) =>
    taskEvent('task.succeeded', taskId, version, {
      topLevelTaskId: taskId,
      requestedBy: 'kairos',
      primaryArtifactId: ARTIFACT,
      artifactIds: [ARTIFACT],
    });

  const failed = (taskId: string, version: number) =>
    taskEvent('task.failed', taskId, version, {
      topLevelTaskId: taskId,
      requestedBy: 'kairos',
      failureReason: 'agent_failed',
    });

  it('starts the work when its task is created, and sends it to review when it succeeds', async () => {
    const item = await create();
    const taskId = uuidv7();

    await taskCreated(taskId, item.id);
    await taskCreated(taskId, item.id);

    expect(await executions(item.id)).toEqual([
      expect.objectContaining({
        workItemId: item.id,
        taskId,
        agentId: AGENT,
        agentVersionId: AGENT_VERSION,
        status: 'queued',
        finishedAt: null,
      }),
    ]);
    const started = await get(item.id);
    expect(started.status).toBe('in_progress');
    expect(started.startedAt).not.toBeNull();

    await statusChanged(taskId, 2, 'queued', 'running');
    // An older event changes nothing.
    await statusChanged(taskId, 1, 'blocked', 'queued');
    expect((await executions(item.id))[0].status).toBe('running');

    await statusChanged(taskId, 3, 'running', 'succeeded');
    await succeeded(taskId, 3);
    await succeeded(taskId, 3);

    const [execution] = await executions(item.id);
    expect(execution).toMatchObject({
      status: 'succeeded',
      primaryArtifactId: ARTIFACT,
    });
    expect(execution.finishedAt).not.toBeNull();
    expect((await get(item.id)).status).toBe('in_review');
    expect(await activityKinds(item.id)).toEqual([
      'created',
      'execution_started',
      'status_changed:todo',
      'status_changed:in_progress',
      'execution_finished',
      'status_changed:in_review',
    ]);
    const activity = (
      await owner.get(`${items()}/${item.id}/activity`).expect(200)
    ).body.items as { kind: string; actor: unknown }[];
    expect(
      activity.filter((entry) => entry.kind !== 'created').map((e) => e.actor),
    ).toEqual([null, null, null, null, null]);

    const events = (await outboxEvents(app)).filter((e) =>
      e.eventType.startsWith('work-execution.'),
    );
    expect(events.map((e) => [e.eventType, e.aggregateVersion])).toEqual([
      ['work-execution.started', 1],
      ['work-execution.completed', 2],
    ]);
    expect(events[1].payload).toMatchObject({
      workItemId: item.id,
      taskId,
      status: 'succeeded',
      primaryArtifactId: ARTIFACT,
    });
  });

  it('records a failure without moving the work, and follows a retry', async () => {
    const item = await create({ status: 'todo' });
    const taskId = uuidv7();
    await taskCreated(taskId, item.id);
    await failed(taskId, 2);

    expect((await executions(item.id))[0]).toMatchObject({
      status: 'failed',
      failureReason: 'agent_failed',
    });
    expect((await get(item.id)).status).toBe('in_progress');

    // Retried in Hephaestus: running again, then succeeding.
    await statusChanged(taskId, 3, 'failed', 'queued');
    expect((await executions(item.id))[0]).toMatchObject({
      status: 'queued',
      failureReason: null,
      finishedAt: null,
    });
    await succeeded(taskId, 4);
    expect((await get(item.id)).status).toBe('in_review');
    expect(
      (await activityKinds(item.id)).filter((k) => k === 'execution_finished'),
    ).toHaveLength(2);
  });

  it('leaves work a person moved on, and ignores tasks that are not for work', async () => {
    const done = await create({ status: 'todo' });
    await owner
      .post(`${items()}/${done.id}/transitions`)
      .send({ action: 'cancel' })
      .expect(200);
    const taskId = uuidv7();
    await taskCreated(taskId, done.id);
    await succeeded(taskId, 2);
    expect((await get(done.id)).status).toBe('cancelled');
    expect((await executions(done.id))[0].status).toBe('succeeded');

    const other = await create();
    await taskCreated(uuidv7(), null);
    await taskCreated(uuidv7(), uuidv7());
    // Another organization's task can't name this organization's work.
    await taskCreated(uuidv7(), other.id, polis.organization());
    await succeeded(uuidv7(), 2);
    expect(await executions(other.id)).toEqual([]);
    expect((await get(other.id)).status).toBe('backlog');
  });
});
