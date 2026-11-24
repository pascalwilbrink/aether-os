import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';

import { SessionReaper } from '@hephaestus/sessions';

import { publishedAgent } from './agora.js';
import { createApp } from './app.js';
import { asMember, type Client } from './auth.js';
import { budgetExhausted, type ScriptedPylonModels } from './fake-models.js';
import type { FakeKnowledgeBase } from './fake-knowledge.js';
import type { FakePolis } from './fake-polis.js';
import type { FakeSessionTokens } from './fake-session-tokens.js';
import { tokens } from './tokens.js';

interface AguiEvent {
  type: string;
  [key: string]: unknown;
}

/** Reads a server-sent event stream whole. */
const sseText = (
  response: request.Response,
  callback: (error: Error | null, body: string) => void,
) => {
  const stream = response as unknown as NodeJS.ReadableStream;
  let body = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => (body += chunk));
  stream.on('end', () => callback(null, body));
};

const eventsOf = (body: string): AguiEvent[] =>
  body
    .split('\n\n')
    .filter((frame) => frame.startsWith('data: '))
    .map((frame) => JSON.parse(frame.slice('data: '.length)) as AguiEvent);

describe('Sessions (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let models: ScriptedPylonModels;
  let sessionTokens: FakeSessionTokens;
  let knowledgeBase: FakeKnowledgeBase;
  let orgId: string;
  let projectId: string;
  let agentId: string;
  let versionId: string;
  let person: Client;
  let base: string;

  beforeEach(async () => {
    ({ app, polis, models, sessionTokens, knowledgeBase } = await createApp());
    orgId = polis.organization();
    projectId = polis.project(orgId);
    ({ agentId, versionId } = await publishedAgent(app, orgId, {
      instructions: 'You help with the project.',
    }));
    person = await asMember(app, orgId, ['member'], { [projectId]: 'viewer' });
    base = `/v1/organizations/${orgId}/projects/${projectId}/sessions`;
  });

  afterEach(async () => {
    await app.close();
  });

  const start = async (client: Client = person) =>
    (await client.post(base).send({ agentId, title: 'Planning' }).expect(201))
      .body as { id: string; agentVersionId: string; status: string };

  let runs = 0;
  const run = async (
    sessionId: string,
    messages: Record<string, unknown>[],
    extra: Record<string, unknown> = {},
    client: Client = person,
  ): Promise<AguiEvent[]> => {
    const response = await client
      .post(`${base}/${sessionId}/runs`)
      .send({ threadId: sessionId, runId: `run-${++runs}`, messages, ...extra })
      .buffer(true)
      .parse(sseText)
      .expect(200)
      .expect('content-type', /text\/event-stream/);
    return eventsOf(response.body as string);
  };

  const published = async (eventType: string) =>
    (
      (await app
        .get(DataSource)
        .query(
          `SELECT message->'payload' AS payload FROM outbox WHERE routing_key = $1 ORDER BY created_at`,
          [eventType],
        )) as { payload: Record<string, unknown> }[]
    ).map((row) => row.payload);

  it('starts a session with the published version and streams a turn as AG-UI events', async () => {
    const session = await start();
    expect(session).toMatchObject({
      agentVersionId: versionId,
      status: 'active',
      startedBy: 'user-1',
      title: 'Planning',
      running: false,
    });
    expect(await published('session.started')).toEqual([
      {
        sessionId: session.id,
        agentId,
        agentVersionId: versionId,
        councilId: null,
        councilVersionId: null,
        startedBy: 'user-1',
      },
    ]);

    models.replies = [{ text: 'Hello there, Ada.' }];
    const events = await run(session.id, [
      { id: 'm-1', role: 'user', content: 'Hi!' },
    ]);
    expect(events.map((event) => event.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]);
    expect(events[0]).toMatchObject({ threadId: session.id, runId: 'run-1' });
    // Every message is announced with its author.
    expect(events[1]).toMatchObject({
      name: 'message-author',
      value: {
        messageId: events[2].messageId,
        author: { kind: 'agent', agentId, agentVersionId: versionId },
      },
    });
    expect(
      events
        .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
        .map((event) => event.delta)
        .join(''),
    ).toBe('Hello there, Ada.');

    // A session token for the person, and the model called with it.
    expect(sessionTokens.requests).toEqual([
      expect.objectContaining({
        projectId,
        sessionId: session.id,
        agentId,
        agentVersionId: versionId,
        expiresInSeconds: 900,
      }),
    ]);
    expect(models.created.at(-1)).toEqual({
      id: 'anthropic/claude',
      token: 'session-token-1',
    });
    expect(JSON.stringify(models.calls[0].prompt)).toContain(
      'You help with the project.',
    );

    const messages = await person.get(`${base}/${session.id}/messages`);
    expect(messages.body.items).toEqual([
      expect.objectContaining({ id: 'm-1', role: 'user', content: 'Hi!' }),
      expect.objectContaining({
        role: 'assistant',
        content: 'Hello there, Ada.',
        toolCalls: [],
      }),
    ]);
    expect(messages.body.items[1].id).toBe(events[2].messageId);

    // The next turn sees the history; messages it already has are ignored.
    models.replies = [{ text: 'Sure.' }];
    await run(session.id, [
      { id: 'm-1', role: 'user', content: 'Hi!' },
      { id: events[2].messageId, role: 'assistant', content: 'changed' },
      { id: 'm-2', role: 'user', content: 'Can you help?' },
    ]);
    const prompt = JSON.stringify(models.calls[1].prompt);
    expect(prompt).toContain('Hello there, Ada.');
    expect(prompt).not.toContain('changed');
    expect(
      (await person.get(`${base}/${session.id}/messages`)).body.items,
    ).toHaveLength(4);
  });

  it('runs its own tools (knowledge, read-only) and reports their results', async () => {
    knowledgeBase.available = true;
    const session = await start();
    models.replies = [
      { toolCall: { tool: 'search_knowledge', input: { query: 'deploys' } } },
      { text: 'Nothing about deploys yet.' },
    ];
    const events = await run(session.id, [
      { id: 'm-1', role: 'user', content: 'How do we deploy?' },
    ]);
    expect(events.map((event) => event.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_END',
      'TOOL_CALL_RESULT',
      'CUSTOM',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ]);
    expect(events[2]).toMatchObject({ toolCallName: 'search_knowledge' });
    expect(JSON.parse(events[3].delta as string)).toEqual({ query: 'deploys' });
    expect(knowledgeBase.calls[0]).toMatchObject({
      method: 'search',
      scope: { organizationId: orgId, projectId, token: 'session-token-1' },
    });
    const offered = (models.calls[0].tools ?? []).map((tool) => tool.name);
    expect(offered).toContain('search_knowledge');
    expect(offered).not.toContain('propose_knowledge');

    const messages = (await person.get(`${base}/${session.id}/messages`)).body
      .items as { role: string; toolCalls: unknown[]; toolCallId: string }[];
    expect(messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
    expect(messages[2].toolCallId).toBe(events[2].toolCallId);
  });

  it("ends the turn at a frontend tool's call and continues with its answer", async () => {
    const session = await start();
    const tools = [
      {
        name: 'open_task',
        description: 'Opens a task in Iris.',
        parameters: {
          type: 'object',
          properties: { taskId: { type: 'string' } },
          required: ['taskId'],
        },
      },
    ];
    models.replies = [
      { toolCall: { tool: 'open_task', input: { taskId: 't-1' } } },
      { text: 'Should not run in this turn.' },
    ];
    const first = await run(
      session.id,
      [{ id: 'm-1', role: 'user', content: 'Show me task t-1.' }],
      { tools },
    );
    expect(first.map((event) => event.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_END',
      'RUN_FINISHED',
    ]);
    expect(models.calls).toHaveLength(1);
    const toolCallId = first[2].toolCallId as string;

    models.replies = [{ text: 'It is open.' }];
    const second = await run(
      session.id,
      [
        {
          id: 'answer-1',
          role: 'tool',
          toolCallId,
          content: '{"opened":true}',
        },
      ],
      { tools },
    );
    expect(second.at(-1)?.type).toBe('RUN_FINISHED');
    expect(JSON.stringify(models.calls[1].prompt)).toContain('opened');

    // An answer to a call the agent never made isn't a new message.
    await person
      .post(`${base}/${session.id}/runs`)
      .send({
        threadId: session.id,
        runId: 'run-x',
        messages: [
          { id: 'answer-2', role: 'tool', toolCallId: 'nope', content: '' },
        ],
      })
      .expect(400);
  });

  it('is only its person’s, and only for people with session:use in the project', async () => {
    const session = await start();
    const other = await asMember(
      app,
      orgId,
      ['member'],
      { [projectId]: 'editor' },
      'user-2',
    );
    await other.get(`${base}/${session.id}`).expect(404);
    await other.post(`${base}/${session.id}/end`).expect(404);
    expect((await other.get(base).expect(200)).body.items).toEqual([]);
    expect((await person.get(base).expect(200)).body.items).toHaveLength(1);

    const outsider = await asMember(app, orgId, ['member'], {}, 'user-3');
    await outsider.post(base).send({ agentId }).expect(404);

    const serviceAccount = await tokens.user({
      sub: 'sa-1',
      organizationId: orgId,
      roles: ['member'],
      projectRoles: { [projectId]: 'editor' },
      subType: 'service_account',
    });
    await request(app.getHttpServer())
      .post(base)
      .set('authorization', `Bearer ${serviceAccount}`)
      .send({ agentId })
      .expect(403);
  });

  it('runs one turn at a time, and not once ended', async () => {
    const session = await start();
    await person
      .post(`${base}/${session.id}/runs`)
      .send({ threadId: 'another', runId: 'r', messages: [] })
      .expect(400);
    await person
      .post(`${base}/${session.id}/runs`)
      .send({ threadId: session.id, runId: 'r', messages: [] })
      .expect(400);

    await app
      .get(DataSource)
      .query(`UPDATE sessions SET running_since = now() WHERE id = $1`, [
        session.id,
      ]);
    expect((await person.get(`${base}/${session.id}`)).body.running).toBe(true);
    const busy = await person
      .post(`${base}/${session.id}/runs`)
      .send({
        threadId: session.id,
        runId: 'r',
        messages: [{ id: 'm-1', role: 'user', content: 'Hi' }],
      })
      .expect(409);
    expect(busy.body.code).toBe('SESSION_BUSY');
    // A lost run (past the run timeout) doesn't hold the session.
    await app
      .get(DataSource)
      .query(
        `UPDATE sessions SET running_since = now() - interval '1 hour' WHERE id = $1`,
        [session.id],
      );
    await run(session.id, [{ id: 'm-1', role: 'user', content: 'Hi' }]);

    const ended = await person.post(`${base}/${session.id}/end`).expect(200);
    expect(ended.body).toMatchObject({
      status: 'ended',
      endedReason: 'closed',
    });
    await person.post(`${base}/${session.id}/end`).expect(200);
    expect(await published('session.ended')).toEqual([
      expect.objectContaining({ sessionId: session.id, reason: 'closed' }),
    ]);
    const refused = await person
      .post(`${base}/${session.id}/runs`)
      .send({
        threadId: session.id,
        runId: 'r',
        messages: [{ id: 'm-9', role: 'user', content: 'Again' }],
      })
      .expect(409);
    expect(refused.body.code).toBe('SESSION_ENDED');
  });

  it('ends a run whose budget ran out with RUN_ERROR, and releases the session', async () => {
    const session = await start();
    models.replies = [budgetExhausted('project', projectId)];
    const events = await run(session.id, [
      { id: 'm-1', role: 'user', content: 'Hi' },
    ]);
    expect(events.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      code: 'BUDGET_EXHAUSTED',
    });
    expect((await person.get(`${base}/${session.id}`)).body.running).toBe(
      false,
    );
  });

  it('refuses a run Pistis refuses a token for, without holding the session', async () => {
    const session = await start();
    sessionTokens.refuse = true;
    await person
      .post(`${base}/${session.id}/runs`)
      .send({
        threadId: session.id,
        runId: 'r',
        messages: [{ id: 'm-1', role: 'user', content: 'Hi' }],
      })
      .expect(403);
    expect((await person.get(`${base}/${session.id}`)).body.running).toBe(
      false,
    );
  });

  it('ends idle sessions', async () => {
    const idle = await start();
    const fresh = await start();
    await app
      .get(DataSource)
      .query(
        `UPDATE sessions SET last_activity_at = now() - interval '2 hours' WHERE id = $1`,
        [idle.id],
      );
    expect(await app.get(SessionReaper).reap()).toBe(1);
    expect((await person.get(`${base}/${idle.id}`)).body).toMatchObject({
      status: 'ended',
      endedReason: 'idle',
    });
    expect((await person.get(`${base}/${fresh.id}`)).body.status).toBe(
      'active',
    );
    expect(await published('session.ended')).toEqual([
      expect.objectContaining({ sessionId: idle.id, reason: 'idle' }),
    ]);
    expect(
      (await person.get(base).query({ status: 'active' })).body.items,
    ).toHaveLength(1);
  });
});
