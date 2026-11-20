import { randomUUID } from 'node:crypto';

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { createApp, MISSING_ID } from './app.js';
import { asMember, type Client } from './auth.js';
import { tokens } from './tokens.js';

/** A platform service with its own token (no organization). */
async function asPlatform(
  app: INestApplication<App>,
  scopes: string[],
): Promise<Client> {
  const token = await tokens.service('operator', scopes);
  return request
    .agent(app.getHttpServer())
    .set('authorization', `Bearer ${token}`);
}

const price = {
  inputPerMTok: '1.5',
  outputPerMTok: '6',
  cacheReadPerMTok: '0.15',
  cacheWritePerMTok: null,
};

describe('Model catalogue (e2e)', () => {
  let app: INestApplication<App>;
  let operator: Client;
  let member: Client;
  let orgId: string;
  // The catalogue isn't emptied between tests: each makes its own models.
  let modelId: string;

  beforeEach(async () => {
    let polis;
    ({ app, polis } = await createApp());
    orgId = polis.organization();
    operator = await asPlatform(app, ['platform:manage']);
    member = await asMember(app, orgId, ['owner']);
    modelId = `gpt-test-${randomUUID().slice(0, 8)}`;
  });

  afterEach(async () => {
    await app.close();
  });

  const create = (body: Record<string, unknown> = {}) =>
    operator.post('/v1/models').send({
      provider: 'openai',
      model: modelId,
      name: `GPT test ${modelId}`,
      contextWindow: 400_000,
      price,
      ...body,
    });

  it('lists the seeded catalogue to anyone with a token, with current prices', async () => {
    const { body } = await member
      .get('/v1/models?provider=anthropic&status=active&limit=100')
      .expect(200);

    const sonnet = body.items.find(
      (item: { model: string }) => item.model === 'claude-sonnet-5-5',
    );
    expect(sonnet).toMatchObject({
      provider: 'anthropic',
      name: 'Claude Sonnet 5.5',
      status: 'active',
      contextWindow: 1_000_000,
      price: {
        inputPerMTok: '2.000000',
        outputPerMTok: '10.000000',
        cacheReadPerMTok: '0.100000',
        cacheWritePerMTok: '2.500000',
        longContext: null,
      },
    });
    const haiku = body.items.find(
      (item: { model: string }) => item.model === 'claude-haiku-5-5',
    );
    expect(haiku.price.longContext).toEqual({
      aboveInputTokens: 100_000,
      inputPerMTok: '0.500000',
      outputPerMTok: '2.500000',
      cacheReadPerMTok: '0.050000',
      cacheWritePerMTok: '0.625000',
    });
    // By name.
    const names = body.items.map((item: { name: string }) => item.name);
    expect(names).toEqual(
      [...names].sort((a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)),
    );
  });

  it("has OpenAI's current models, with their long-context rates", async () => {
    const { body } = await member
      .get('/v1/models?provider=openai&status=active&limit=100')
      .expect(200);
    expect(
      body.items.map((item: { model: string }) => item.model).sort(),
    ).toEqual(['gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.2-astra', 'gpt-6.2-sol']);
    const sol = body.items.find(
      (item: { model: string }) => item.model === 'gpt-6.2-sol',
    );
    expect(sol).toMatchObject({
      name: 'GPT-6.2 Sol',
      contextWindow: 922_000,
      maxOutputTokens: 128_000,
      price: {
        inputPerMTok: '2.000000',
        outputPerMTok: '10.000000',
        cacheReadPerMTok: '0.100000',
        cacheWritePerMTok: '2.500000',
        longContext: {
          aboveInputTokens: 272_000,
          inputPerMTok: '4.000000',
          outputPerMTok: '15.000000',
          cacheReadPerMTok: '0.200000',
          cacheWritePerMTok: '5.000000',
        },
      },
    });
  });

  it('lets only platform services with platform:manage change it', async () => {
    await member
      .post('/v1/models')
      .send({ provider: 'openai', model: modelId, name: 'x', price })
      .expect(403);
    const reader = await asPlatform(app, ['platform:read']);
    await reader
      .post('/v1/models')
      .send({ provider: 'openai', model: modelId, name: 'x', price })
      .expect(403);

    const created = await create().expect(201);
    expect(created.body).toMatchObject({
      provider: 'openai',
      model: modelId,
      status: 'active',
      contextWindow: 400_000,
      maxOutputTokens: null,
      version: 1,
      price: {
        inputPerMTok: '1.500000',
        outputPerMTok: '6.000000',
        cacheReadPerMTok: '0.150000',
        cacheWritePerMTok: null,
        longContext: null,
        createdBy: 'operator',
      },
    });
    expect((await create().expect(409)).body.code).toBe('MODEL_ALREADY_EXISTS');
    // A provider the gateway can't call isn't accepted.
    await create({ provider: 'acme', model: `${modelId}-x` }).expect(400);

    await member
      .put(`/v1/models/${created.body.id}`)
      .send({
        name: 'x',
        status: 'retired',
        contextWindow: null,
        maxOutputTokens: null,
      })
      .expect(403);
    await member.get(`/v1/models/${MISSING_ID}`).expect(404);
  });

  it('only lets new agent versions choose active models', async () => {
    const { body: model } = await create().expect(201);
    const { body: agent } = await member
      .post(`/v1/organizations/${orgId}/agents`)
      .send({ name: 'Helper', description: '' })
      .expect(201);
    const version = (provider: string, name: string) =>
      member
        .post(`/v1/organizations/${orgId}/agents/${agent.id}/versions`)
        .send({
          instructions: 'Be helpful.',
          model: { provider, model: name },
          capabilities: [],
          tools: [],
          skills: [],
          runtime: {
            provider: 'mastra',
            executionMode: 'standard',
            sandboxRequired: false,
          },
        });

    await version('openai', modelId).expect(201);
    expect(
      (await version('openai', 'no-such-model').expect(409)).body.code,
    ).toBe('MODEL_NOT_AVAILABLE');

    const updated = await operator
      .put(`/v1/models/${model.id}`)
      .send({
        name: 'GPT test (old)',
        status: 'deprecated',
        contextWindow: 400_000,
        maxOutputTokens: 128_000,
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      status: 'deprecated',
      maxOutputTokens: 128_000,
      version: 2,
    });
    expect((await version('openai', modelId).expect(409)).body.code).toBe(
      'MODEL_NOT_AVAILABLE',
    );
  });

  it('versions prices: new ones start later and never replace old ones', async () => {
    const { body: model } = await create().expect(201);
    const prices = `/v1/models/${model.id}/prices`;

    const past = await operator
      .post(prices)
      .send({ ...price, effectiveFrom: '2020-01-01T00:00:00.000Z' })
      .expect(409);
    expect(past.body.code).toBe('MODEL_PRICE_INVALID');

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    await operator
      .post(prices)
      .send({ inputPerMTok: '1', outputPerMTok: '4', effectiveFrom: tomorrow })
      .expect(201);

    const listed = await member.get(prices).expect(200);
    expect(
      listed.body.items.map(
        (item: { inputPerMTok: string }) => item.inputPerMTok,
      ),
    ).toEqual(['1.000000', '1.500000']);
    // Tomorrow's price isn't in force yet.
    const current = await member.get(`/v1/models/${model.id}`).expect(200);
    expect(current.body.price.inputPerMTok).toBe('1.500000');
  });
});
