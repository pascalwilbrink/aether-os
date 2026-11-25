import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';

import { createApp, MISSING_ID } from './app.js';
import {
  asMember,
  asOperator,
  asOwner,
  type Client,
  foundOrganization,
} from './auth.js';
import { outboxEvents } from './outbox.js';

describe('Teams (e2e)', () => {
  let app: INestApplication<App>;
  let orgId: string;
  let owner: Client;
  let base: string;

  beforeEach(async () => {
    app = await createApp();
    orgId = (await foundOrganization(app, 'acme')).id;
    owner = await asOwner(app, orgId);
    base = `/v1/organizations/${orgId}/teams`;
  });

  afterEach(async () => {
    await app.close();
  });

  const department = async (slug: string) =>
    (
      await owner
        .post(`/v1/organizations/${orgId}/departments`)
        .send({ name: slug, slug, description: '' })
        .expect(201)
    ).body.id as string;

  const person = async (email: string) =>
    (
      await owner
        .post(`/v1/organizations/${orgId}/persons`)
        .send({ name: email, email })
        .expect(201)
    ).body.id as string;

  const team = async (slug: string, departmentIds: string[] = []) =>
    (
      await owner
        .post(base)
        .send({ name: slug, slug, departmentIds })
        .expect(201)
    ).body.id as string;

  const ids = (body: { items: { id: string }[] }) =>
    body.items.map((item) => item.id);

  it('creates teams in departments, changes and lists them', async () => {
    const engineering = await department('engineering');
    const research = await department('research');

    const created = await owner
      .post(base)
      .send({
        name: 'Platform',
        slug: 'platform',
        description: 'Runs the platform',
        departmentIds: [research, engineering, research],
      })
      .expect(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      organizationId: orgId,
      name: 'Platform',
      slug: 'platform',
      description: 'Runs the platform',
      departmentIds: [engineering, research].sort(),
      status: 'active',
      createdBy: 'user-1',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      version: 1,
    });
    const id = created.body.id as string;

    const taken = await owner
      .post(base)
      .send({ name: 'Again', slug: 'platform' })
      .expect(409);
    expect(taken.body.code).toBe('TEAM_SLUG_TAKEN');

    const changed = await owner
      .put(`${base}/${id}`)
      .send({
        name: 'Platform',
        description: 'Runs it',
        departmentIds: [engineering],
      })
      .expect(200);
    expect(changed.body).toMatchObject({
      description: 'Runs it',
      departmentIds: [engineering],
      version: 2,
    });
    // The same again: no new version.
    await owner
      .put(`${base}/${id}`)
      .send({
        name: 'Platform',
        description: 'Runs it',
        departmentIds: [engineering],
      })
      .expect(200)
      .expect(({ body }) => expect(body.version).toBe(2));

    const other = await team('other', [research]);
    const inResearch = await owner
      .get(base)
      .query({ departmentId: research })
      .expect(200);
    expect(ids(inResearch.body)).toEqual([other]);
    const all = await owner.get(base).expect(200);
    expect(ids(all.body)).toEqual([other, id]);

    // Every member reads teams; only owners and admins change them.
    const viewer = await asMember(app, orgId, ['viewer'], { sub: 'user-2' });
    await viewer.get(`${base}/${id}`).expect(200);
    await viewer.post(base).send({ name: 'X', slug: 'xyz' }).expect(403);
    await (await asOperator(app)).get(`${base}/${id}`).expect(200);
    await owner.get(`${base}/${MISSING_ID}`).expect(404);

    // Another organization's department, or an archived one, can't be joined.
    const globex = await foundOrganization(app, 'globex');
    const foreign = (
      await (
        await asOwner(app, globex.id)
      )
        .post(`/v1/organizations/${globex.id}/departments`)
        .send({ name: 'x', slug: 'xyz', description: '' })
        .expect(201)
    ).body.id as string;
    await owner
      .post(base)
      .send({ name: 'Stray', slug: 'stray', departmentIds: [foreign] })
      .expect(404);
    const old = await department('old');
    await owner
      .post(`/v1/organizations/${orgId}/departments/${old}/archive`)
      .expect(200);
    const archivedDepartment = await owner
      .post(base)
      .send({ name: 'Late', slug: 'late', departmentIds: [old] })
      .expect(409);
    expect(archivedDepartment.body.code).toBe('DEPARTMENT_ARCHIVED');
  });

  it('puts persons in teams, many each, and lists a person’s teams', async () => {
    const platform = await team('platform');
    const security = await team('security');
    const ada = await person('ada@example.com');
    const grace = await person('grace@example.com');

    const added = await owner
      .post(`${base}/${platform}/members`)
      .send({ personId: ada })
      .expect(201);
    expect(added.body).toEqual({
      teamId: platform,
      personId: ada,
      addedBy: 'user-1',
      addedAt: expect.any(String),
    });
    await owner
      .post(`${base}/${platform}/members`)
      .send({ personId: grace })
      .expect(201);
    await owner
      .post(`${base}/${security}/members`)
      .send({ personId: ada })
      .expect(201);
    const again = await owner
      .post(`${base}/${platform}/members`)
      .send({ personId: ada })
      .expect(409);
    expect(again.body.code).toBe('TEAM_MEMBER_EXISTS');
    await owner
      .post(`${base}/${platform}/members`)
      .send({ personId: MISSING_ID })
      .expect(404);

    const members = await owner.get(`${base}/${platform}/members`).expect(200);
    expect(
      members.body.items.map((m: { personId: string }) => m.personId),
    ).toEqual([grace, ada]);
    const adasTeams = await owner
      .get(base)
      .query({ personId: ada })
      .expect(200);
    expect(ids(adasTeams.body)).toEqual([security, platform]);

    await owner.delete(`${base}/${platform}/members/${grace}`).expect(204);
    await owner.delete(`${base}/${platform}/members/${grace}`).expect(404);

    // Deleting a person takes them out of every team.
    await owner.delete(`/v1/organizations/${orgId}/persons/${ada}`).expect(204);
    const left = await owner.get(base).query({ personId: ada }).expect(200);
    expect(left.body.items).toEqual([]);

    const events = (await outboxEvents(app))
      .filter((e) => e.eventType.startsWith('team-member.'))
      .map((e) => [
        e.eventType,
        (e.payload as { teamId: string; personId: string }).personId,
      ]);
    expect(events).toEqual([
      ['team-member.added', ada],
      ['team-member.added', grace],
      ['team-member.added', ada],
      ['team-member.removed', grace],
      ['team-member.removed', ada],
      ['team-member.removed', ada],
    ]);
  });

  it('archives a team, which then keeps its members but takes no changes', async () => {
    const id = await team('platform');
    const ada = await person('ada@example.com');
    await owner
      .post(`${base}/${id}/members`)
      .send({ personId: ada })
      .expect(201);

    const archived = await owner.post(`${base}/${id}/archive`).expect(200);
    expect(archived.body).toMatchObject({ status: 'archived', version: 2 });
    await owner.post(`${base}/${id}/archive`).expect(200);

    const add = await owner
      .post(`${base}/${id}/members`)
      .send({ personId: await person('grace@example.com') })
      .expect(409);
    expect(add.body.code).toBe('TEAM_ARCHIVED');
    const change = await owner
      .put(`${base}/${id}`)
      .send({ name: 'New', description: '', departmentIds: [] })
      .expect(409);
    expect(change.body.code).toBe('TEAM_ARCHIVED');
    const members = await owner.get(`${base}/${id}/members`).expect(200);
    expect(members.body.items).toHaveLength(1);

    const active = await owner
      .get(base)
      .query({ status: 'active' })
      .expect(200);
    expect(active.body.items).toEqual([]);

    const events = (await outboxEvents(app))
      .filter((e) => e.eventType.startsWith('team.'))
      .map((e) => [e.eventType, e.aggregateVersion]);
    expect(events).toEqual([
      ['team.created', 1],
      ['team.archived', 2],
    ]);
  });
});
