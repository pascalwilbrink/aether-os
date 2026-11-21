import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';

import { asMember, createApp, type Client } from './app.js';
import type { FakePolis } from './fake-polis.js';
import { outboxEvents } from './outbox.js';

const MISSING_ID = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';

const skillMd = (name: string, description: string) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`;

describe('Skills (e2e)', () => {
  let app: INestApplication<App>;
  let polis: FakePolis;
  let orgId: string;
  let member: Client;

  beforeEach(async () => {
    ({ app, polis } = await createApp());
    orgId = polis.organization();
    member = await asMember(app, orgId, ['member']);
  });

  afterEach(async () => {
    await app.close();
  });

  const skills = () => `/v1/organizations/${orgId}/skills`;

  it('creates skills with versions, files only when reading one', async () => {
    const created = await member
      .post(skills())
      .send({
        name: 'code-review',
        files: [
          {
            path: 'SKILL.md',
            content: skillMd('code-review', 'Reviews a change'),
          },
          { path: 'references/checklist.md', content: '- tests\n' },
        ],
      })
      .expect(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      organizationId: orgId,
      name: 'code-review',
      description: 'Reviews a change',
      status: 'active',
      latestVersion: 1,
      createdBy: 'user-1',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const one = `${skills()}/${created.body.id}`;

    const second = await member
      .post(`${one}/versions`)
      .send({
        files: [
          {
            path: 'SKILL.md',
            content: skillMd('code-review', 'Reviews it better'),
          },
        ],
      })
      .expect(201);
    expect(second.body).toMatchObject({
      version: 2,
      description: 'Reviews it better',
      fileCount: 1,
      files: [{ path: 'SKILL.md', content: expect.any(String) }],
    });
    expect((await member.get(one).expect(200)).body).toMatchObject({
      latestVersion: 2,
      description: 'Reviews it better',
    });

    const versions = await member.get(`${one}/versions`).expect(200);
    expect(
      versions.body.items.map((v: { version: number }) => v.version),
    ).toEqual([2, 1]);
    expect(versions.body.items[1]).not.toHaveProperty('files');
    const first = await member.get(`${one}/versions/1`).expect(200);
    expect(first.body.files).toEqual([
      { path: 'SKILL.md', content: skillMd('code-review', 'Reviews a change') },
      { path: 'references/checklist.md', content: '- tests\n' },
    ]);
    await member.get(`${one}/versions/3`).expect(404);
    await member.get(`${skills()}/${MISSING_ID}`).expect(404);

    const listed = await member.get(skills()).expect(200);
    expect(listed.body.items).toMatchObject([{ name: 'code-review' }]);

    // Archived: no new versions, idempotent, filtered out of active.
    await member.post(`${one}/archive`).expect(200);
    const archived = await member.post(`${one}/archive`).expect(200);
    expect(archived.body.status).toBe('archived');
    const refused = await member
      .post(`${one}/versions`)
      .send({
        files: [{ path: 'SKILL.md', content: skillMd('code-review', 'x') }],
      })
      .expect(409);
    expect(refused.body.code).toBe('SKILL_ARCHIVED');
    expect(
      (await member.get(`${skills()}?status=active`).expect(200)).body.items,
    ).toEqual([]);
  });

  it('checks the folder is a skill', async () => {
    const problem = async (body: object) =>
      (await member.post(skills()).send(body).expect(409)).body;

    expect(
      await problem({
        name: 'a',
        files: [{ path: 'README.md', content: 'x' }],
      }),
    ).toMatchObject({
      code: 'SKILL_INVALID',
      detail: 'A skill has a SKILL.md at its root.',
    });
    expect(
      await problem({
        name: 'a',
        files: [{ path: 'SKILL.md', content: skillMd('b', 'x') }],
      }),
    ).toMatchObject({ detail: 'SKILL.md names the skill b, but it is a.' });
    await member
      .post(skills())
      .send({ name: 'a', files: [{ path: '../SKILL.md', content: 'x' }] })
      .expect(400);
    await member
      .post(skills())
      .send({ name: 'Bad Name', files: [] })
      .expect(400);

    await member
      .post(skills())
      .send({
        name: 'a',
        files: [{ path: 'SKILL.md', content: skillMd('a', 'x') }],
      })
      .expect(201);
    const duplicate = await problem({
      name: 'a',
      files: [{ path: 'SKILL.md', content: skillMd('a', 'x') }],
    });
    expect(duplicate.code).toBe('SKILL_ALREADY_EXISTS');
  });

  it('publishes every change, versions with their files', async () => {
    const created = await member
      .post(skills())
      .send({
        name: 'code-review',
        files: [
          { path: 'SKILL.md', content: skillMd('code-review', 'Reviews') },
        ],
      })
      .expect(201);
    const id = created.body.id as string;
    await member
      .post(`${skills()}/${id}/versions`)
      .send({
        files: [
          { path: 'SKILL.md', content: skillMd('code-review', 'Better') },
          { path: 'scripts/check.sh', content: 'echo ok\n' },
        ],
      })
      .expect(201);
    await member.post(`${skills()}/${id}/archive`).expect(200);
    // Archiving again publishes nothing.
    await member.post(`${skills()}/${id}/archive`).expect(200);

    const events = await outboxEvents(app);
    expect(
      events.map((event) => [event.eventType, event.aggregateVersion]),
    ).toEqual([
      ['skill.created', 1],
      ['skill-version.published', 2],
      ['skill-version.published', 3],
      ['skill.archived', 4],
    ]);
    for (const event of events) {
      expect(event).toMatchObject({
        aggregateId: id,
        organizationId: orgId,
        actor: { sub: 'user-1', sub_type: 'user' },
      });
    }
    expect(events[0].payload).toEqual({
      skillId: id,
      name: 'code-review',
      createdBy: 'user-1',
      createdAt: expect.any(String),
    });
    expect(events[2].payload).toEqual({
      skillId: id,
      skillVersionId: expect.any(String),
      version: {
        id: expect.any(String),
        skillId: id,
        organizationId: orgId,
        name: 'code-review',
        version: 2,
        description: 'Better',
        files: [
          { path: 'SKILL.md', content: skillMd('code-review', 'Better') },
          { path: 'scripts/check.sh', content: 'echo ok\n' },
        ],
        fileCount: 2,
        sizeBytes: expect.any(Number),
        createdBy: 'user-1',
        createdAt: expect.any(String),
      },
    });
    expect(events[3].payload).toEqual({ skillId: id });
  });

  it('refuses changes in a suspended organization', async () => {
    const suspended = polis.organization('suspended');
    const client = await asMember(app, suspended, ['owner']);
    const refused = await client
      .post(`/v1/organizations/${suspended}/skills`)
      .send({
        name: 'a',
        files: [{ path: 'SKILL.md', content: skillMd('a', 'x') }],
      })
      .expect(409);
    expect(refused.body.code).toBe('ORGANIZATION_SUSPENDED');
  });

  it('needs agent:write to change skills', async () => {
    const viewer = await asMember(app, orgId, ['viewer']);
    await viewer.get(skills()).expect(200);
    await viewer
      .post(skills())
      .send({
        name: 'a',
        files: [{ path: 'SKILL.md', content: skillMd('a', 'x') }],
      })
      .expect(403);
  });
});
