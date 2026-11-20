import type { INestApplication } from '@nestjs/common';
import amqp from 'amqplib';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';
import { inject } from 'vitest';

import { createApp } from './app.js';
import { asMember, type Client } from './auth.js';
import type { FakePolis } from './fake-polis.js';
import { tokens } from './tokens.js';

const SERVICE_ACCOUNT = '0193a1b2-c3d4-7e5f-8a9b-0000000000aa';

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

describe('Agents (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let orgId: string;
  let owner: Client;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    orgId = polis.organization();
    owner = await asMember(app, orgId, ['owner']);
  });

  afterEach(async () => {
    await app.close();
  });

  it('serves no agent API: agents are managed in Agora', async () => {
    await owner
      .post(`/v1/organizations/${orgId}/agents`)
      .send({ name: 'Helper', description: '' })
      .expect(404);
    await owner.get(`/v1/organizations/${orgId}/agents`).expect(404);
  });

  it('runs tasks with what Agora publishes, from its events over RabbitMQ', async () => {
    const connection = await amqp.connect(inject('rabbitmqUrl'));
    try {
      const channel = await connection.createChannel();
      await channel.purgeQueue('hephaestus.agora-events');
      const agentId = uuidv7();
      const versionId = uuidv7();
      let aggregateVersion = 0;
      const publish = (eventType: string, payload: object) => {
        const event = {
          eventId: uuidv7(),
          eventType,
          schemaVersion: 1,
          aggregateId: agentId,
          aggregateVersion: ++aggregateVersion,
          occurredAt: new Date().toISOString(),
          organizationId: orgId,
          projectId: null,
          actor: { sub: 'user-1', sub_type: 'user' },
          payload,
        };
        // As Agora's outbox relay publishes it.
        channel.publish(
          'agora.events',
          eventType,
          Buffer.from(JSON.stringify(event)),
          {
            messageId: event.eventId,
            type: eventType,
            contentType: 'application/json',
            persistent: true,
          },
        );
      };
      publish('agent.created', {
        agentId,
        name: 'Helper',
        description: '',
        createdBy: 'user-1',
        createdAt: new Date().toISOString(),
      });
      publish('agent-version.published', {
        agentId,
        agentVersionId: versionId,
        policySetVersionId: null,
        previousVersionId: null,
        version: {
          ...versionBody,
          id: versionId,
          agentId,
          organizationId: orgId,
          version: 1,
          status: 'published',
          createdBy: 'user-1',
          createdAt: new Date().toISOString(),
          publishedAt: new Date().toISOString(),
        },
      });

      const projectId = polis.project(orgId);
      const tasks = `/v1/organizations/${orgId}/projects/${projectId}/tasks`;
      const deadline = Date.now() + 10_000;
      let created: request.Response;
      for (;;) {
        created = await owner
          .post(tasks)
          .set('idempotency-key', 'from-agora')
          .send({
            title: 'Fix it',
            instructions: 'Fix the bug.',
            agentId,
            serviceAccountId: SERVICE_ACCOUNT,
          });
        if (created.status === 201 || Date.now() > deadline) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        agentId,
        agentVersionId: versionId,
      });
    } finally {
      await connection.close();
    }
  });

  it("checks a version's choices for Agora, with its own token", async () => {
    const checks = `/v1/organizations/${orgId}/agent-version-checks`;
    const agora = request
      .agent(app.getHttpServer())
      .set(
        'authorization',
        `Bearer ${await tokens.service('agora', ['platform:read'])}`,
      );
    const choices = {
      model: versionBody.model,
      tools: versionBody.tools,
      skills: versionBody.skills,
    };

    await agora.post(checks).send(choices).expect(204);
    const model = await agora
      .post(checks)
      .send({ ...choices, model: { provider: 'anthropic', model: 'gone' } })
      .expect(409);
    expect(model.body.code).toBe('MODEL_NOT_AVAILABLE');
    const tools = await agora
      .post(checks)
      .send({ ...choices, tools: [{ name: 'search', enabled: true }] })
      .expect(409);
    expect(tools.body.code).toBe('TOOL_SERVER_INVALID');
    const skills = await agora
      .post(checks)
      .send({
        ...choices,
        skills: [{ name: 'summarize', version: '1', enabled: true }],
      })
      .expect(409);
    expect(skills.body.code).toBe('SKILL_INVALID');
    await agora.post(checks).send({ model: versionBody.model }).expect(400);

    // Only platform services: an organization token is refused.
    await owner.post(checks).send(choices).expect(403);
    await request(app.getHttpServer()).post(checks).send(choices).expect(401);
  });
});
