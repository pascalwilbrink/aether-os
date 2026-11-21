import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';

import { EmbeddingsError, KnowledgeEmbedder } from '@seshat/knowledge';

import { asMember, createApp, type Client } from './app.js';
import type { FakeEmbeddings } from './fake-embeddings.js';
import type { FakePolis } from './fake-polis.js';

interface SearchResponse {
  semantic: boolean;
  results: {
    item: { id: string; title: string };
    passage: string;
    score: number;
    matchedBy: string[];
  }[];
}

describe('Embeddings and hybrid search (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let embeddings: FakeEmbeddings;
  let orgId: string;
  let projectId: string;
  let base: string;
  let admin: Client;

  beforeEach(async () => {
    ({ app, polis, embeddings } = await createApp());
    orgId = polis.organization();
    projectId = polis.project(orgId);
    base = `/v1/organizations/${orgId}/projects/${projectId}/knowledge`;
    admin = await asMember(app, orgId, ['admin'], { sub: 'admin-1' });
  });

  afterEach(async () => {
    await app.close();
  });

  const embed = () => app.get(KnowledgeEmbedder).drain();
  const write = async (title: string, body: string, type = 'fact') =>
    (await admin.post(`${base}/items`).send({ type, title, body }).expect(201))
      .body.id as string;
  const search = async (query: string, extra: object = {}) =>
    (
      await admin
        .post(`${base}/search`)
        .send({ query, ...extra })
        .expect(200)
    ).body as SearchResponse;
  const stored = async () =>
    (await app
      .get(DataSource)
      .query(
        `SELECT item_id, model, dimensions FROM knowledge_embeddings ORDER BY item_id`,
      )) as { item_id: string; model: string; dimensions: number }[];

  it('embeds passages through Pylon, charged to the project, and finds them by meaning', async () => {
    const cars = await write(
      'Company cars',
      'Every team lead may lease a car through the fleet office.',
    );
    const releases = await write(
      'Deploys on Tuesdays',
      'We deploy to production every Tuesday morning.',
      'convention',
    );

    expect(await embed()).toBe(2);
    expect(embeddings.calls).toEqual([
      expect.objectContaining({ organizationId: orgId, projectId }),
      expect.objectContaining({ organizationId: orgId, projectId }),
    ]);
    expect(await stored()).toEqual(
      [cars, releases].sort().map((id) => ({
        item_id: id,
        model: 'openai/fake-embedding',
        dimensions: 37,
      })),
    );

    // "automobile" is in no passage: only its meaning finds the cars.
    const byMeaning = await search('automobile');
    expect(byMeaning.semantic).toBe(true);
    expect(byMeaning.results).toEqual([
      expect.objectContaining({
        item: expect.objectContaining({ id: cars }),
        matchedBy: ['semantic'],
      }),
    ]);

    // Both ways first: "deploy" is a keyword of one and means another.
    await write(
      'Release train',
      'Releases leave with the weekly rollout.',
      'convention',
    );
    await embed();
    const both = await search('deploy');
    expect(both.results.map((result) => result.item.title)).toEqual([
      'Deploys on Tuesdays',
      'Release train',
    ]);
    expect(both.results.map((result) => result.matchedBy)).toEqual([
      ['keyword', 'semantic'],
      ['semantic'],
    ]);

    // The query's embedding is charged to the project too.
    expect(embeddings.calls.at(-1)).toEqual({
      organizationId: orgId,
      projectId,
      texts: ['deploy'],
    });
  });

  it('embeds a new version again, and searches by keyword until it is', async () => {
    const id = await write('Company cars', 'Lease a car through the office.');
    await embed();
    await admin
      .put(`${base}/items/${id}`)
      .send({ title: 'Company bikes', body: 'Lease a bicycle instead.' })
      .expect(200);

    // Its old vectors went with its old passages.
    expect(await stored()).toEqual([]);
    const meanwhile = await search('automobile');
    expect(meanwhile.results).toEqual([]);
    expect((await search('bicycle')).results).toEqual([
      expect.objectContaining({ matchedBy: ['keyword'] }),
    ]);

    await embed();
    expect(await stored()).toHaveLength(1);
    expect((await search('automobile')).results).toEqual([]);
  });

  it("tries again later when Pylon can't embed, and searches by keyword meanwhile", async () => {
    embeddings.failure = new EmbeddingsError(
      'Pylon answered 402 BUDGET_EXHAUSTED',
      true,
    );
    const id = await write('Company cars', 'Lease a car through the office.');

    expect(await embed()).toBe(1);
    // Waiting for its backoff: not taken again at once.
    expect(await embed()).toBe(0);
    const [item] = (await app.get(DataSource).query(
      `SELECT embedding_status, embedding_error, embedding_attempts, next_embed_at > now() AS waits
           FROM knowledge_items WHERE id = $1`,
      [id],
    )) as Record<string, unknown>[];
    expect(item).toEqual({
      embedding_status: 'pending',
      embedding_error: 'Pylon answered 402 BUDGET_EXHAUSTED',
      embedding_attempts: 1,
      waits: true,
    });

    // The query can't be embedded either: keywords only, and said so.
    const keywordOnly = await search('car');
    expect(keywordOnly.semantic).toBe(false);
    expect(keywordOnly.results).toEqual([
      expect.objectContaining({ matchedBy: ['keyword'] }),
    ]);

    // Once the backoff is over, it's embedded.
    embeddings.failure = null;
    await app
      .get(DataSource)
      .query(
        `UPDATE knowledge_items SET next_embed_at = now() - interval '1 second'`,
      );
    expect(await embed()).toBe(1);
    expect((await search('automobile')).results).toHaveLength(1);
  });

  it('searches by keyword only without Pylon', async () => {
    await app.close();
    ({ app, polis } = await createApp({ embeddings: null }));
    orgId = polis.organization();
    projectId = polis.project(orgId);
    base = `/v1/organizations/${orgId}/projects/${projectId}/knowledge`;
    admin = await asMember(app, orgId, ['admin']);

    await write('Company cars', 'Lease a car through the office.');
    expect(await embed()).toBe(0);
    const found = await search('car');
    expect(found).toEqual({
      semantic: false,
      results: [expect.objectContaining({ matchedBy: ['keyword'] })],
    });
  });
});
