import type { INestApplication } from '@nestjs/common';
import amqp from 'amqplib';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { inject } from 'vitest';

import {
  EventInbox,
  OutboxRelay,
  type DomainEvent,
  type ProxenosEvents,
} from '@kairos/core';

import { asMember, createApp, type Client } from './app.js';
import type { FakePolis } from './fake-polis.js';

const AGENT = '0193a1b2-c3d4-7e5f-8a9b-0000000000a1';
const SERVICE_ACCOUNT = '0193a1b2-c3d4-7e5f-8a9b-0000000000a2';
const TEMPLATE = '0193a1b2-c3d4-7e5f-8a9b-0000000000a3';
const LINK = '0193a1b2-c3d4-7e5f-8a9b-0000000000a4';

describe('Automations (e2e)', () => {
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

  const automations = () =>
    `/v1/organizations/${orgId}/projects/${projectId}/automations`;

  const body = (overrides: Record<string, unknown> = {}) => ({
    name: 'Fix labelled bugs',
    trigger: { type: 'github.issue', event: 'github.issue.opened' },
    action: {
      serviceAccountId: SERVICE_ACCOUNT,
      task: {
        agentId: AGENT,
        title: 'Fix #{{issue.number}}: {{issue.title}}',
        instructions: 'Fix {{issue.url}}, reported by {{author}}.',
      },
      reviewArtifactKinds: ['pull_request'],
    },
    ...overrides,
  });

  const create = async (overrides: Record<string, unknown> = {}) =>
    (await owner.post(automations()).send(body(overrides)).expect(201)).body;

  /** A GitHub issue event as Proxenos publishes it. */
  const issueEvent = (
    eventType: string,
    overrides: Partial<ProxenosEvents.GithubIssueOpened> = {},
  ): DomainEvent<ProxenosEvents.GithubIssueOpened> => {
    const deliveryId = uuidv7();
    return {
      eventId: uuidv7(),
      eventType,
      schemaVersion: 1,
      aggregateId: deliveryId,
      aggregateVersion: 1,
      occurredAt: new Date(),
      organizationId: orgId,
      projectId: null,
      actor: null,
      payload: {
        webhookDeliveryId: deliveryId,
        deliveryId: 'github-delivery',
        repositoryId: uuidv7(),
        repository: 'acme/api',
        projectIds: [projectId],
        links: [{ projectId, linkId: LINK }],
        number: 12,
        title: 'Login fails for uppercase emails',
        url: 'https://github.com/acme/api/issues/12',
        isPullRequest: false,
        labels: ['bug'],
        label: null,
        commentId: null,
        author: { login: 'ada', type: 'User' },
        authorPermission: 'write',
        fromAetherOs: false,
        ...overrides,
      },
    };
  };

  const deliver = (source: string, event: DomainEvent) =>
    app.get(EventInbox).receive(source, event);

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

  it('creates, reads, changes and lists automations (automation:manage)', async () => {
    const created = await create();
    expect(created).toMatchObject({
      organizationId: orgId,
      projectId,
      status: 'active',
      description: '',
      createdBy: 'user-1',
      version: 1,
      // Defaults filled in.
      trigger: {
        repositoryLinkId: null,
        label: null,
        minimumPermission: 'write',
        includePullRequests: false,
        includeAetherOs: false,
      },
      action: { workInRepository: true },
    });

    // Project editors read them; only admins (owners, admins) manage them.
    const editor = await asMember(app, orgId, ['member'], {
      projectRoles: { [projectId]: 'editor' },
    });
    await editor.get(`${automations()}/${created.id}`).expect(200);
    await editor.post(automations()).send(body()).expect(403);
    const stranger = await asMember(app, orgId, ['member']);
    await stranger.get(automations()).expect(404);

    const updated = await owner
      .put(`${automations()}/${created.id}`)
      .send(body({ name: 'Renamed' }))
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Renamed', version: 2 });

    await owner.post(`${automations()}/${created.id}/pause`).expect(200);
    await create({ name: 'Second' });
    const paused = await owner
      .get(`${automations()}?status=paused`)
      .expect(200);
    expect(
      paused.body.items.map((item: { name: string }) => item.name),
    ).toEqual(['Renamed']);

    await owner.post(`${automations()}/${created.id}/archive`).expect(200);
    await owner.post(`${automations()}/${created.id}/archive`).expect(200);
    const refused = await owner
      .post(`${automations()}/${created.id}/resume`)
      .expect(409);
    expect(refused.body.code).toBe('AUTOMATION_ARCHIVED');
  });

  it('refuses invalid actions and archived projects', async () => {
    const both = await owner
      .post(automations())
      .send(
        body({
          action: {
            serviceAccountId: SERVICE_ACCOUNT,
            task: {
              agentId: AGENT,
              title: 'x',
              instructions: '{{issue.body}}',
            },
            template: { templateId: TEMPLATE },
          },
        }),
      )
      .expect(400);
    expect(
      both.body.errors.map((error: { pointer: string }) => error.pointer),
    ).toEqual(['/action', '/action/task/instructions']);

    const archived = polis.project(orgId, 'archived');
    const refused = await owner
      .post(`/v1/organizations/${orgId}/projects/${archived}/automations`)
      .send(body())
      .expect(409);
    expect(refused.body.code).toBe('PROJECT_ARCHIVED');
  });

  it('fires once per matching event, sending task.create to Hephaestus', async () => {
    const automation = await create();
    await create({
      name: 'Only labelled',
      trigger: {
        type: 'github.issue',
        event: 'github.issue.opened',
        label: 'aether',
      },
    });
    const event = issueEvent('github.issue.opened');

    await deliver('proxenos', event);
    await deliver('proxenos', { ...event });

    const [run] = await runs(automation.id);
    expect(await runs(automation.id)).toHaveLength(1);
    expect(run).toMatchObject({
      status: 'requested',
      taskId: null,
      event: {
        eventId: event.eventId,
        type: 'github.issue.opened',
        repository: 'acme/api',
        issueNumber: 12,
        author: 'ada',
      },
    });

    const [command] = await outbox('hephaestus.commands');
    expect(await outbox('hephaestus.commands')).toHaveLength(1);
    expect(command).toMatchObject({
      eventId: run.id,
      eventType: 'task.create',
      organizationId: orgId,
      projectId,
      actor: { sub: 'kairos', sub_type: 'service' },
      payload: {
        automationId: automation.id,
        task: {
          agentId: AGENT,
          serviceAccountId: SERVICE_ACCOUNT,
          title: 'Fix #12: Login fails for uppercase emails',
          instructions:
            'Fix https://github.com/acme/api/issues/12, reported by ada.',
          repository: { linkId: LINK },
          review: { artifactKinds: ['pull_request'] },
        },
      },
    });
    expect(await outbox('kairos.events')).toMatchObject([
      {
        eventType: 'automation.triggered',
        payload: {
          automationId: automation.id,
          runId: run.id,
          triggerType: 'github.issue.opened',
          sourceEventId: event.eventId,
        },
      },
    ]);
  });

  it("doesn't fire paused automations, other events or untrusted authors", async () => {
    const automation = await create();
    const paused = await create({ name: 'Paused' });
    await owner.post(`${automations()}/${paused.id}/pause`).expect(200);

    await deliver('proxenos', issueEvent('github.issue.labeled'));
    await deliver(
      'proxenos',
      issueEvent('github.issue.opened', { authorPermission: 'read' }),
    );
    await deliver(
      'proxenos',
      issueEvent('github.issue.opened', { fromAetherOs: true }),
    );
    await deliver(
      'proxenos',
      issueEvent('github.issue.opened', { links: [], projectIds: [] }),
    );

    expect(await runs(automation.id)).toEqual([]);
    expect(await runs(paused.id)).toEqual([]);
    expect(await outbox('hephaestus.commands')).toEqual([]);
  });

  it('sends its concurrency key, and marks a skipped run', async () => {
    const automation = await create({
      action: {
        ...body().action,
        concurrency: { key: '{{repository}}#{{issue.number}}', policy: 'skip' },
      },
    });
    expect(automation.action.concurrency).toEqual({
      key: '{{repository}}#{{issue.number}}',
      policy: 'skip',
    });
    await deliver('proxenos', issueEvent('github.issue.opened'));

    const [command] = await outbox('hephaestus.commands');
    expect(command.payload).toMatchObject({
      task: {
        // The automation's own: two automations never share a key.
        concurrency: { key: `${automation.id}:acme/api#12`, policy: 'skip' },
      },
    });

    const [run] = await runs(automation.id);
    await deliver('hephaestus', {
      eventId: uuidv7(),
      eventType: 'task.create-rejected',
      schemaVersion: 1,
      aggregateId: run.id as string,
      aggregateVersion: 1,
      occurredAt: new Date(),
      organizationId: orgId,
      projectId,
      actor: null,
      payload: {
        idempotencyKey: run.id,
        automationId: automation.id,
        code: 'TASK_CONCURRENCY_SKIPPED',
        message:
          "Task … with the concurrency key … hasn't finished; this one is skipped.",
      },
    });
    expect(await runs(automation.id)).toMatchObject([
      { status: 'skipped', rejection: { code: 'TASK_CONCURRENCY_SKIPPED' } },
    ]);

    // Fields it can't use are refused.
    const refused = await owner
      .post(automations())
      .send(
        body({
          action: {
            ...body().action,
            concurrency: { key: '{{issue.body}}', policy: 'queue' },
          },
        }),
      )
      .expect(400);
    expect(refused.body.errors).toMatchObject([
      { pointer: '/action/concurrency/key' },
    ]);
  });

  it("fills in a template with the event, and follows Hephaestus's answers", async () => {
    const fromTemplate = await create({
      name: 'From a template',
      action: {
        serviceAccountId: SERVICE_ACCOUNT,
        template: {
          templateId: TEMPLATE,
          version: 2,
          inputs: { issue: '{{repository}}#{{issue.number}}' },
        },
        workInRepository: false,
      },
    });
    await deliver('proxenos', issueEvent('github.issue.opened'));
    const [command] = await outbox('hephaestus.commands');
    expect(command.payload).toEqual({
      automationId: fromTemplate.id,
      template: {
        templateId: TEMPLATE,
        version: 2,
        inputs: { issue: 'acme/api#12' },
        serviceAccountId: SERVICE_ACCOUNT,
      },
    });

    const answer = (eventType: string, payload: Record<string, unknown>) =>
      deliver('hephaestus', {
        eventId: uuidv7(),
        eventType,
        schemaVersion: 1,
        aggregateId: uuidv7(),
        aggregateVersion: 1,
        occurredAt: new Date(),
        organizationId: orgId,
        projectId,
        actor: null,
        payload,
      });
    const taskId = uuidv7();
    await answer('task.created', {
      taskId,
      idempotencyKey: command.eventId,
    });
    // Tasks started elsewhere, with any key, are none of Kairos's business.
    await answer('task.created', { taskId: uuidv7(), idempotencyKey: 'key-1' });
    expect(await runs(fromTemplate.id)).toMatchObject([
      { status: 'created', taskId },
    ]);

    const second = await create({ name: 'Rejected' });
    await deliver('proxenos', issueEvent('github.issue.opened'));
    const [run] = await runs(second.id);
    await answer('task.create-rejected', {
      idempotencyKey: run.id,
      automationId: second.id,
      code: 'AGENT_NOT_PUBLISHED',
      message: 'The agent has no published version.',
    });
    expect(await runs(second.id)).toMatchObject([
      {
        status: 'rejected',
        rejection: {
          code: 'AGENT_NOT_PUBLISHED',
          message: 'The agent has no published version.',
        },
      },
    ]);
  });

  it("fires on Proxenos's events from RabbitMQ and sends the command there", async () => {
    const automation = await create();
    const connection = await amqp.connect(inject('rabbitmqUrl'));
    try {
      const channel = await connection.createChannel();
      // Stands in for Hephaestus's command queue.
      const { queue } = await channel.assertQueue('', { exclusive: true });
      await channel.bindQueue(queue, 'hephaestus.commands', 'task.create');

      const event = issueEvent('github.issue.opened');
      await channel.assertExchange('proxenos.events', 'topic', {
        durable: true,
      });
      channel.publish(
        'proxenos.events',
        event.eventType,
        Buffer.from(JSON.stringify(event)),
        { messageId: event.eventId, contentType: 'application/json' },
      );

      const deadline = Date.now() + 10_000;
      while ((await runs(automation.id)).length === 0) {
        if (Date.now() > deadline) throw new Error('Timed out');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await app.get(OutboxRelay).relayBatch();

      let message: amqp.GetMessage | false = false;
      for (let i = 0; i < 50 && !message; i++) {
        message = await channel.get(queue, { noAck: true });
        if (!message) await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(message && JSON.parse(message.content.toString())).toMatchObject({
        eventType: 'task.create',
        payload: { automationId: automation.id },
      });
    } finally {
      await connection.close();
    }
  });
});
