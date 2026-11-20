import type { INestApplication } from '@nestjs/common';
import amqp from 'amqplib';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { inject } from 'vitest';

import { EventInbox, type DomainEvent } from '@hephaestus/core';

import { createApp } from './app.js';
import { asMember, type Client } from './auth.js';
import type { FakePolis } from './fake-polis.js';
import { createAgent, publishedAgent } from './agora.js';

const SERVICE_ACCOUNT = '0193a1b2-c3d4-7e5f-8a9b-0000000000aa';
const AUTOMATION = '0193a1b2-c3d4-7e5f-8a9b-0000000000bb';
const versionBody = {
  instructions: 'Be helpful.',
  model: { provider: 'anthropic', model: 'claude' },
  capabilities: [],
  tools: [],
  skills: [],
  runtime: {
    provider: 'local',
    executionMode: 'standard' as const,
    sandboxRequired: false,
  },
};

describe('task.create commands (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let orgId: string;
  let projectId: string;
  let owner: Client;
  let agentId: string;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    orgId = polis.organization();
    projectId = polis.project(orgId);
    owner = await asMember(app, orgId, ['owner']);
    const published = await publishedAgent(app, orgId, versionBody);
    agentId = published.agentId;
  });

  afterEach(async () => {
    await app.close();
  });

  /** A command as Kairos sends it. */
  const command = (
    payload: Record<string, unknown>,
    overrides: Partial<DomainEvent> = {},
  ): DomainEvent => ({
    eventId: uuidv7(),
    eventType: 'task.create',
    schemaVersion: 1,
    aggregateId: uuidv7(),
    aggregateVersion: 1,
    occurredAt: new Date(),
    organizationId: orgId,
    projectId,
    actor: { sub: 'kairos', sub_type: 'service' },
    payload: { automationId: AUTOMATION, ...payload },
    ...overrides,
  });

  const task = (extra: Record<string, unknown> = {}) => ({
    task: {
      title: 'Fix issue #12',
      instructions: 'Uppercase emails cannot sign in.',
      agentId,
      serviceAccountId: SERVICE_ACCOUNT,
      ...extra,
    },
  });

  /** Delivers a command as the consumer does: through the inbox. */
  const deliver = (event: DomainEvent) =>
    app.get(EventInbox).receive('commands', event);

  const published = async (eventType: string) =>
    (
      (await app
        .get(DataSource)
        .query(
          `SELECT message->'payload' AS payload, message->'actor' AS actor FROM outbox WHERE routing_key = $1 ORDER BY created_at`,
          [eventType],
        )) as {
        payload: Record<string, unknown>;
        actor: Record<string, unknown>;
      }[]
    ).map((row) => ({ ...row.payload, actor: row.actor }));

  const tasks = async () =>
    (
      await owner
        .get(`/v1/organizations/${orgId}/projects/${projectId}/tasks`)
        .expect(200)
    ).body.items as Record<string, unknown>[];

  it('creates a task once per command, announcing it again when resent', async () => {
    const sent = command(task({ budgetUsd: '2' }));
    await deliver(sent);

    const [created] = await tasks();
    expect(created).toMatchObject({
      title: 'Fix issue #12',
      agentId,
      serviceAccountId: SERVICE_ACCOUNT,
      requestedBy: 'kairos',
      status: 'queued',
    });
    expect(await published('task.created')).toEqual([
      expect.objectContaining({
        taskId: created.id,
        idempotencyKey: sent.eventId,
        actor: { sub: 'kairos', sub_type: 'service' },
      }),
    ]);
    // Its tree's budget came with it.
    await expect(
      owner.get(
        `/v1/organizations/${orgId}/projects/${projectId}/tasks/${String(created.id)}/budget`,
      ),
    ).resolves.toMatchObject({ body: { limitUsd: '2.000000' } });

    // Sent again (Kairos never heard back): the same task, announced again.
    await expect(deliver(sent)).resolves.toBe(false);
    await deliver(command(task(), { eventId: sent.eventId }));
    expect(await tasks()).toHaveLength(1);
    expect(
      (await published('task.created')).map((event) => event.taskId),
    ).toEqual([created.id, created.id, created.id]);
  });

  it('creates a task from a template', async () => {
    const template = (
      await owner
        .post(`/v1/organizations/${orgId}/task-templates`)
        .send({
          name: 'Fix a bug',
          description: '',
          title: 'Fix {{issue}}',
          instructions: 'Fix the bug described in {{issue}}.',
          agentId,
          inputs: [{ name: 'issue', description: 'The issue' }],
        })
        .expect(201)
    ).body;

    await deliver(
      command({
        template: {
          templateId: template.id,
          inputs: { issue: '#12' },
          serviceAccountId: SERVICE_ACCOUNT,
        },
      }),
    );

    expect(await tasks()).toMatchObject([
      {
        title: 'Fix #12',
        taskTemplateId: template.id,
        taskTemplateVersion: 1,
      },
    ]);
  });

  it('answers commands that can never succeed with task.create-rejected', async () => {
    const unpublished = await createAgent(app, orgId, { name: 'Draft' });
    const sent = [
      command(task({ agentId: unpublished })),
      command(task({ title: '' })),
      command({ ...task(), template: { templateId: uuidv7() } }),
      command(task(), { actor: { sub: 'user-1', sub_type: 'user' } }),
      command(task(), { projectId: polis.project(polis.organization()) }),
    ];
    for (const event of sent) {
      await deliver(event);
    }

    expect(await tasks()).toEqual([]);
    expect(
      (await published('task.create-rejected')).map(
        ({ idempotencyKey, automationId, code }) => ({
          idempotencyKey,
          automationId,
          code,
        }),
      ),
    ).toEqual(
      [
        'AGENT_NOT_PUBLISHED',
        'VALIDATION_FAILED',
        'VALIDATION_FAILED',
        'FORBIDDEN',
        'NOT_FOUND',
      ].map((code, index) => ({
        idempotencyKey: sent[index].eventId,
        automationId: AUTOMATION,
        code,
      })),
    );
  });

  it('answers a skipped concurrency key with task.create-rejected', async () => {
    const withKey = () =>
      command(task({ concurrency: { key: 'acme/api#12', policy: 'skip' } }));
    await deliver(withKey());
    const second = withKey();
    await deliver(second);

    expect(await tasks()).toHaveLength(1);
    expect(await published('task.create-rejected')).toEqual([
      expect.objectContaining({
        idempotencyKey: second.eventId,
        code: 'TASK_CONCURRENCY_SKIPPED',
      }),
    ]);
  });

  it('takes commands from RabbitMQ (hephaestus.commands)', async () => {
    const connection = await amqp.connect(inject('rabbitmqUrl'));
    try {
      const channel = await connection.createChannel();
      const sent = command(task());
      channel.publish(
        'hephaestus.commands',
        'task.create',
        Buffer.from(JSON.stringify(sent)),
        {
          messageId: sent.eventId,
          type: 'task.create',
          contentType: 'application/json',
          persistent: true,
        },
      );

      const deadline = Date.now() + 10_000;
      while ((await tasks()).length === 0) {
        if (Date.now() > deadline) throw new Error('Timed out');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(await published('task.created')).toEqual([
        expect.objectContaining({ idempotencyKey: sent.eventId }),
      ]);
    } finally {
      await connection.close();
    }
  });
});
