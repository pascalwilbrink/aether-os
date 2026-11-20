import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import {
  agoraAgent,
  asMember,
  asPlatform,
  asTask,
  createApp,
  taskToken,
  TASK_ID,
  TREE_ID,
  type Client,
} from './app.js';
import { providers } from './fake-providers.js';
import type { FakePolis } from './fake-polis.js';
import type { FakeSecretStore } from './fake-secrets.js';
import { outboxEvents } from './outbox.js';

const EXECUTION_ID = '0193a1b2-c3d4-7e5f-8a9b-00000000dddd';

describe('Model calls (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let secrets: FakeSecretStore;
  let orgId: string;
  let projectId: string;
  let owner: Client;

  beforeEach(async () => {
    ({ app, polis, secrets } = await createApp());
    orgId = polis.organization();
    projectId = polis.project(orgId);
    owner = await asMember(app, orgId, ['owner']);
    // The organization's keys, through the API (stored in "OpenBao").
    for (const provider of ['anthropic', 'openai', 'mistral', 'google']) {
      await owner
        .put(`/v1/organizations/${orgId}/model-keys/${provider}`)
        .send({ apiKey: `${provider}-org-key` })
        .expect(200);
    }
  });

  afterEach(async () => {
    await app.close();
  });

  const usage = async (query = '') =>
    (await owner.get(`/v1/organizations/${orgId}/usage${query}`).expect(200))
      .body.items as Record<string, unknown>[];

  const http = () => request(app.getHttpServer());

  it("passes Anthropic's Messages through with the organization's key, and meters it", async () => {
    const token = await taskToken(orgId, projectId);
    const res = await http()
      .post('/v1/providers/anthropic/v1/messages')
      // As the Anthropic SDK sends its key.
      .set('x-api-key', token)
      .set('anthropic-version', '2023-06-01')
      .set('anthropic-beta', 'prompt-caching-2024-07-31')
      .set('x-aether-execution-id', EXECUTION_ID)
      .send({
        model: 'claude-sonnet-5-5',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'Hi' }],
      })
      .expect(200);
    expect(res.body).toMatchObject({ id: 'msg_1', stop_reason: 'end_turn' });
    expect(res.headers['request-id']).toBe('req-1');

    // The provider got its key, never the token.
    const sent = providers.last();
    expect(sent.path).toBe('/v1/messages');
    expect(sent.headers['x-api-key']).toBe('anthropic-org-key');
    expect(sent.headers.authorization).toBeUndefined();
    expect(sent.headers['anthropic-beta']).toBe('prompt-caching-2024-07-31');
    expect(JSON.stringify(sent.headers)).not.toContain(token);

    // Input counts the cache: 10 + 2 written + 5 read. At Sonnet 5.5's
    // prices: 10 × 2 + 7 × 10 + 5 × 0.1 + 2 × 2.5 = 95.5 per million.
    expect(await usage('?groupBy=execution')).toEqual([
      {
        group: EXECUTION_ID,
        modelCalls: 1,
        inputTokens: 17,
        outputTokens: 7,
        cacheReadTokens: 5,
        cacheWriteTokens: 2,
        costUsd: '0.000096',
      },
    ]);
    expect(await usage('?groupBy=task_tree')).toMatchObject([
      { group: TREE_ID, modelCalls: 1 },
    ]);
  });

  it('streams an answer back as it comes, and meters the stream', async () => {
    const task = await asTask(app, orgId, projectId);
    const res = await task
      .post('/v1/providers/anthropic/v1/messages')
      .send({
        model: 'claude-sonnet-5-5',
        max_tokens: 100,
        stream: true,
        messages: [{ role: 'user', content: 'Hi' }],
      })
      .buffer(true)
      .parse((response, done) => {
        let text = '';
        response.on('data', (chunk: Buffer) => (text += chunk.toString()));
        response.on('end', () => done(null, text));
      })
      .expect(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body as string).toContain('event: message_stop');
    expect(res.body as string).toContain('"text":"lo"');

    expect(await usage()).toMatchObject([
      { modelCalls: 1, inputTokens: 17, outputTokens: 7, cacheReadTokens: 5 },
    ]);
  });

  it("uses the agent's own key before the organization's, and asks OpenAI for usage in streams", async () => {
    const agentId = await agoraAgent(app, orgId);
    await owner
      .put(`/v1/organizations/${orgId}/agents/${agentId}/model-keys/openai`)
      .send({ apiKey: 'openai-agent-key' })
      .expect(200);
    const task = await asTask(app, orgId, projectId, { agentId });

    await task
      .post('/v1/providers/openai/v1/chat/completions')
      .send({
        model: 'gpt-6.2-sol',
        stream: true,
        messages: [{ role: 'user', content: 'Hi' }],
      })
      .expect(200);
    const sent = providers.last();
    expect(sent.headers.authorization).toBe('Bearer openai-agent-key');
    expect(sent.body.stream_options).toEqual({ include_usage: true });

    const [byAgent] = await usage('?groupBy=agent');
    expect(byAgent).toMatchObject({
      group: agentId,
      modelCalls: 1,
      inputTokens: 20,
      outputTokens: 4,
      cacheReadTokens: 8,
    });
    expect(byAgent.costUsd).not.toBeNull();
  });

  it("passes OpenAI's Responses, Mistral and Google's Gemini through too", async () => {
    const task = await asTask(app, orgId, projectId);
    await task
      .post('/v1/providers/openai/v1/responses')
      .send({ model: 'gpt-6.2-sol', input: 'Hi' })
      .expect(200);
    await task
      .post('/v1/providers/mistral/v1/chat/completions')
      .send({ model: 'mistral-large', messages: [] })
      .expect(200);
    expect(providers.last().headers.authorization).toBe(
      'Bearer mistral-org-key',
    );

    const gemini = await request(app.getHttpServer())
      .post(
        '/v1/providers/google/v1beta/models/gemini-3-pro:streamGenerateContent?alt=sse',
      )
      // As Google's SDK sends its key.
      .set('x-goog-api-key', await taskToken(orgId, projectId))
      .send({ contents: [{ parts: [{ text: 'Hi' }] }] })
      .expect(200);
    expect(gemini.headers['content-type']).toContain('text/event-stream');
    expect(providers.last()).toMatchObject({
      path: '/v1beta/models/gemini-3-pro:streamGenerateContent?alt=sse',
      headers: { 'x-goog-api-key': 'google-org-key' },
    });

    // Models outside the catalogue (Mistral's, Google's here) are unpriced.
    const byModel = await usage('?groupBy=model');
    expect(
      Object.fromEntries(
        byModel.map((item) => [
          item.group,
          [item.inputTokens, item.outputTokens, item.costUsd !== null],
        ]),
      ),
    ).toEqual({
      'openai/gpt-6.2-sol': [30, 6, true],
      'mistral/mistral-large': [20, 4, false],
      // The last chunk's usage; output includes the model's thoughts.
      'google/gemini-3-pro': [12, 8, false],
    });
  });

  it("calls an organization's Ollama server, counted but unpriced", async () => {
    await owner
      .put(`/v1/organizations/${orgId}/model-keys/ollama`)
      .send({ baseUrl: providers.url })
      .expect(200);
    const task = await asTask(app, orgId, projectId);
    await task
      .post('/v1/providers/ollama/v1/chat/completions')
      .send({ model: 'qwen3:8b', messages: [] })
      .expect(200);
    expect(providers.last().headers.authorization).toBeUndefined();
    expect(await usage()).toMatchObject([
      { modelCalls: 1, inputTokens: 20, costUsd: null },
    ]);
  });

  it('only lets task tokens with model:invoke call', async () => {
    const body = { model: 'claude-sonnet-5-5', messages: [] };
    const path = '/v1/providers/anthropic/v1/messages';
    await http().post(path).send(body).expect(401);
    await owner.post(path).send(body).expect(403);
    const viewer = await asTask(app, orgId, projectId, { role: 'viewer' });
    await viewer.post(path).send(body).expect(403);
    const platform = await asPlatform(app, ['platform:read']);
    await platform.post(path).send(body).expect(403);
    expect(providers.received).toEqual([]);
  });

  it("refuses what it won't pass on, and models it won't call", async () => {
    const task = await asTask(app, orgId, projectId);
    await task.post('/v1/providers/anthropic/v1/models').send({}).expect(400);
    await task
      .post('/v1/providers/acme/v1/chat/completions')
      .send({ model: 'x' })
      .expect(400);
    await task
      .post('/v1/providers/openai/v1/chat/completions')
      .send({ messages: [] })
      .expect(400);
    await task
      .post('/v1/providers/anthropic/v1/messages')
      .set('x-aether-execution-id', 'not-a-uuid')
      .send({ model: 'claude-sonnet-5-5' })
      .expect(400);

    // An embedding model isn't for chat.
    const embedding = await task
      .post('/v1/providers/openai/v1/chat/completions')
      .send({ model: 'text-embedding-3-small', messages: [] })
      .expect(409);
    expect(embedding.body.code).toBe('MODEL_NOT_AVAILABLE');

    // No key anywhere (and no platform key for it).
    await owner
      .delete(`/v1/organizations/${orgId}/model-keys/anthropic`)
      .expect(204);
    const missing = await task
      .post('/v1/providers/anthropic/v1/messages')
      .send({ model: 'claude-sonnet-5-5', messages: [] })
      .expect(409);
    expect(missing.body.code).toBe('MODEL_KEY_MISSING');

    // The platform's, when the organization has none.
    secrets.secrets.set('platform/llm/anthropic', { apiKey: 'platform-key' });
    await task
      .post('/v1/providers/anthropic/v1/messages')
      .send({ model: 'claude-sonnet-5-5', messages: [] })
      .expect(200);
    expect(providers.last().headers['x-api-key']).toBe('platform-key');

    secrets.down = true;
    await task
      .post('/v1/providers/anthropic/v1/messages')
      .send({ model: 'claude-sonnet-5-5', messages: [] })
      .expect(503);
    expect(providers.received).toHaveLength(1);
  });

  it('refuses retired models', async () => {
    const platform = await asPlatform(app, ['platform:manage']);
    const models = await platform
      .get('/v1/models?provider=anthropic&model=claude-haiku-5-5')
      .expect(200);
    const [haiku] = models.body.items as { id: string; name: string }[];
    await platform
      .put(`/v1/models/${haiku.id}`)
      .send({
        name: haiku.name,
        status: 'retired',
        contextWindow: null,
        maxOutputTokens: null,
      })
      .expect(200);
    const res = await (
      await asTask(app, orgId, projectId)
    )
      .post('/v1/providers/anthropic/v1/messages')
      .send({ model: 'claude-haiku-5-5', messages: [] })
      .expect(409);
    expect(res.body.code).toBe('MODEL_RETIRED');
  });

  it("retries a provider that's overloaded, and passes its refusals back unmetered", async () => {
    const task = await asTask(app, orgId, projectId);
    providers.script.push({
      status: 429,
      body: { error: 'slow down' },
      headers: { 'retry-after': '0' },
    });
    await task
      .post('/v1/providers/anthropic/v1/messages')
      .send({ model: 'claude-sonnet-5-5', messages: [] })
      .expect(200);
    expect(providers.received).toHaveLength(2);

    providers.script.push({
      status: 400,
      body: { type: 'error', error: { message: 'max_tokens is required' } },
    });
    const refused = await task
      .post('/v1/providers/anthropic/v1/messages')
      .send({ model: 'claude-sonnet-5-5', messages: [] })
      .expect(400);
    expect(refused.body.error.message).toBe('max_tokens is required');

    // 500 twice: Pylon's one retry (PROVIDER_RETRIES=1) is used up.
    providers.script.push({ status: 500 }, { status: 500 });
    await task
      .post('/v1/providers/anthropic/v1/messages')
      .send({ model: 'claude-sonnet-5-5', messages: [] })
      .expect(500);

    expect(await usage()).toMatchObject([{ modelCalls: 1 }]);
  });

  it("says when a provider can't be reached", async () => {
    await owner
      .put(`/v1/organizations/${orgId}/model-keys/ollama`)
      .send({ baseUrl: 'http://127.0.0.1:1' })
      .expect(200);
    const res = await (
      await asTask(app, orgId, projectId)
    )
      .post('/v1/providers/ollama/v1/chat/completions')
      .send({ model: 'qwen3:8b', messages: [] })
      .expect(502);
    expect(res.body.code).toBe('PROVIDER_UNAVAILABLE');
  });

  it('refuses calls once a budget ran out, naming it, and announces it', async () => {
    const task = await asTask(app, orgId, projectId);
    await owner
      .put(`/v1/organizations/${orgId}/projects/${projectId}/budget`)
      .send({ limitUsd: '0.0001' })
      .expect(200);
    const call = () =>
      task
        .post('/v1/providers/anthropic/v1/messages')
        .send({ model: 'claude-sonnet-5-5', messages: [] });

    // 0.000096 of 0.0001: past 80%, not out yet.
    await call().expect(200);
    await call().expect(200);
    const refused = await call().expect(402);
    expect(refused.body).toMatchObject({
      code: 'BUDGET_EXHAUSTED',
      budget: { scope: 'project', scopeId: projectId },
    });
    expect(providers.received).toHaveLength(2);

    // Calls are recorded once their answer has gone back, so wait for it.
    await vi.waitFor(async () => {
      const events = (await outboxEvents(app)).map((event) => event.eventType);
      expect(events).toEqual([
        'budget.changed',
        'budget.threshold-reached',
        'budget.exhausted',
      ]);
    });

    // A task tree's budget is the narrowest: it's the one named.
    await owner
      .put(
        `/v1/organizations/${orgId}/projects/${projectId}/task-trees/${TREE_ID}/budget`,
      )
      .send({ limitUsd: '0.0001' })
      .expect(200);
    expect((await call().expect(402)).body.budget).toEqual({
      scope: 'task_tree',
      scopeId: TREE_ID,
    });

    // Hephaestus's check before it resumes a task.
    const hephaestus = await asPlatform(app, ['platform:read']);
    const check = await hephaestus
      .post(`/v1/organizations/${orgId}/budget-checks`)
      .send({ projectId, taskTreeId: TREE_ID })
      .expect(200);
    expect(check.body).toEqual({
      exhausted: { scope: 'task_tree', scopeId: TREE_ID },
    });
    await owner
      .post(`/v1/organizations/${orgId}/budget-checks`)
      .send({ projectId })
      .expect(403);
    const other = await hephaestus
      .post(`/v1/organizations/${orgId}/budget-checks`)
      .send({ projectId: polis.project(orgId) })
      .expect(200);
    expect(other.body).toEqual({ exhausted: null });
  });

  it('embeds texts for a project, charged to it', async () => {
    const seshat = await asPlatform(app, ['model:invoke']);
    const res = await seshat
      .post(`/v1/organizations/${orgId}/projects/${projectId}/embeddings`)
      .send({
        provider: 'openai',
        model: 'text-embedding-3-small',
        input: ['a', 'b', 'c'],
        dimensions: 3,
      })
      .expect(200);
    expect(res.body).toEqual({
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 3,
      // In input order, whatever order the provider gave them in.
      data: [
        { index: 0, embedding: [0, 0.5, 0.25] },
        { index: 1, embedding: [1, 0.5, 0.25] },
        { index: 2, embedding: [2, 0.5, 0.25] },
      ],
      usage: { inputTokens: 12, costUsd: '0.000000' },
    });
    expect(providers.last()).toMatchObject({
      path: '/v1/embeddings',
      headers: { authorization: 'Bearer openai-org-key' },
      body: { dimensions: 3, encoding_format: 'float' },
    });

    // A task token embeds in its own project, charged to its tree too.
    await (
      await asTask(app, orgId, projectId)
    )
      .post(`/v1/organizations/${orgId}/projects/${projectId}/embeddings`)
      .set('x-aether-purpose', 'search')
      .send({
        provider: 'openai',
        model: 'text-embedding-3-small',
        input: ['x'],
      })
      .expect(200);
    expect(await usage('?groupBy=task_tree')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ group: TREE_ID, modelCalls: 1 }),
        expect.objectContaining({ group: null, modelCalls: 1 }),
      ]),
    );

    // People don't; chat models don't embed; neither does Anthropic.
    await owner
      .post(`/v1/organizations/${orgId}/projects/${projectId}/embeddings`)
      .send({
        provider: 'openai',
        model: 'text-embedding-3-small',
        input: ['x'],
      })
      .expect(403);
    for (const [provider, model] of [
      ['openai', 'gpt-6.2-sol'],
      ['anthropic', 'claude-sonnet-5-5'],
      ['openai', 'text-embedding-unknown'],
    ]) {
      const refused = await seshat
        .post(`/v1/organizations/${orgId}/projects/${projectId}/embeddings`)
        .send({ provider, model, input: ['x'] })
        .expect(409);
      expect(refused.body.code).toBe('MODEL_NOT_AVAILABLE');
    }

    providers.script.push({ status: 400, body: { error: 'bad input' } });
    const providerRefused = await seshat
      .post(`/v1/organizations/${orgId}/projects/${projectId}/embeddings`)
      .send({
        provider: 'openai',
        model: 'text-embedding-3-small',
        input: ['x'],
      })
      .expect(502);
    expect(providerRefused.body.code).toBe('PROVIDER_REFUSED');
  });

  it('records who called, and what for', async () => {
    const agentId = await agoraAgent(app, orgId);
    await (
      await asTask(app, orgId, projectId, { agentId })
    )
      .post('/v1/providers/anthropic/v1/messages')
      .set('x-aether-purpose', 'judge')
      .send({ model: 'claude-sonnet-5-5', messages: [] })
      .expect(200);
    const [call] = (await app
      .get((await import('typeorm')).DataSource)
      .query('SELECT * FROM model_calls')) as Record<string, unknown>[];
    expect(call).toMatchObject({
      organization_id: orgId,
      project_id: projectId,
      task_id: TASK_ID,
      task_tree_id: TREE_ID,
      agent_id: agentId,
      caller: 'service-account-1',
      purpose: 'judge',
      kind: 'chat',
      key_source: 'organization',
      finish_reason: 'end_turn',
    });
  });
});
