import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import { v7 as uuidv7 } from 'uuid';

import { EventInbox, type DomainEvent, type PistisEvents } from '@polis/core';

import { createApp, MISSING_ID } from './app.js';
import {
  asMember,
  asOperator,
  asOwner,
  type Client,
  foundOrganization,
} from './auth.js';
import { outboxEvents } from './outbox.js';

type UserCreated = PistisEvents.PistisEventPayloads['user.created'];

describe('Persons (e2e)', () => {
  let app: INestApplication<App>;
  let orgId: string;
  let owner: Client;
  let base: string;

  beforeEach(async () => {
    app = await createApp();
    orgId = (await foundOrganization(app, 'acme')).id;
    owner = await asOwner(app, orgId);
    base = `/v1/organizations/${orgId}/persons`;
  });

  afterEach(async () => {
    await app.close();
  });

  /** Pistis's `user.created`, through Polis's inbox. */
  const userCreated = async (email: string | null, userId = uuidv7()) => {
    const event: DomainEvent<UserCreated> = {
      eventId: uuidv7(),
      eventType: 'user.created',
      schemaVersion: 1,
      aggregateId: userId,
      aggregateVersion: 1,
      occurredAt: new Date(),
      organizationId: null,
      projectId: null,
      actor: null,
      payload: { userId, displayName: 'Someone', email, status: 'active' },
    };
    await app.get(EventInbox).receive('pistis', event);
    return userId;
  };

  /** One of Pistis's later user events (the user as they are now). */
  const userChanged = (
    eventType: 'user.updated' | 'user.disabled',
    userId: string,
    version: number,
    email: string | null,
    status: 'active' | 'disabled' = 'active',
  ) =>
    app.get(EventInbox).receive('pistis', {
      eventId: uuidv7(),
      eventType,
      schemaVersion: 1,
      aggregateId: userId,
      aggregateVersion: version,
      occurredAt: new Date(),
      organizationId: null,
      projectId: null,
      actor: null,
      payload: { userId, displayName: 'Someone', email, status },
    } as DomainEvent<UserCreated>);

  const department = async (slug: string) =>
    (
      await owner
        .post(`/v1/organizations/${orgId}/departments`)
        .send({ name: slug, slug, description: '' })
        .expect(201)
    ).body.id as string;

  const ada = (overrides: Record<string, unknown> = {}) => ({
    name: 'Ada Lovelace',
    email: 'Ada@Example.com',
    ...overrides,
  });

  it('records a person with their fields and departments', async () => {
    const engineering = await department('engineering');
    const research = await department('research');

    const created = await owner
      .post(base)
      .send(
        ada({
          description: 'Writes the first programs',
          role: 'Analyst',
          gender: 'Female',
          departmentIds: [research, engineering, research],
        }),
      )
      .expect(201);
    expect(created.body).toEqual({
      id: expect.any(String),
      organizationId: orgId,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      description: 'Writes the first programs',
      role: 'Analyst',
      gender: 'Female',
      departmentIds: [engineering, research].sort(),
      userId: null,
      createdBy: 'user-1',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
      version: 1,
    });
    const id = created.body.id as string;

    // The address is unique in the organization, whatever its case.
    const taken = await owner
      .post(base)
      .send(ada({ name: 'Other', email: 'ADA@example.com' }))
      .expect(409);
    expect(taken.body.code).toBe('PERSON_EMAIL_TAKEN');

    // Defaults: no description, role or gender, no department.
    const grace = await owner
      .post(base)
      .send({ name: 'Grace', email: 'grace@example.com' })
      .expect(201);
    expect(grace.body).toMatchObject({
      description: '',
      role: null,
      gender: null,
      departmentIds: [],
    });

    const inResearch = await owner
      .get(base)
      .query({ departmentId: research })
      .expect(200);
    expect(inResearch.body.items.map((p: { id: string }) => p.id)).toEqual([
      id,
    ]);
    const all = await owner.get(base).expect(200);
    expect(all.body.items).toHaveLength(2);

    // Every member reads persons; owners and admins change them.
    const viewer = await asMember(app, orgId, ['viewer'], { sub: 'user-2' });
    await viewer.get(`${base}/${id}`).expect(200);
    await viewer
      .post(base)
      .send(ada({ email: 'x@example.com' }))
      .expect(403);
    await (await asOperator(app)).get(`${base}/${id}`).expect(200);
    await owner.get(`${base}/${MISSING_ID}`).expect(404);
  });

  it('keeps persons out of archived and foreign departments', async () => {
    const old = await department('old');
    const stays = (
      await owner
        .post(base)
        .send(ada({ departmentIds: [old] }))
        .expect(201)
    ).body;
    await owner
      .post(`/v1/organizations/${orgId}/departments/${old}/archive`)
      .expect(200);

    const refused = await owner
      .post(base)
      .send({ name: 'Late', email: 'late@example.com', departmentIds: [old] })
      .expect(409);
    expect(refused.body.code).toBe('DEPARTMENT_ARCHIVED');
    // Staying in it is fine.
    await owner
      .put(`${base}/${stays.id}`)
      .send(ada({ role: 'Analyst', departmentIds: [old] }))
      .expect(200);

    const other = await foundOrganization(app, 'globex');
    const foreign = (
      await (
        await asOwner(app, other.id)
      )
        .post(`/v1/organizations/${other.id}/departments`)
        .send({ name: 'xyz', slug: 'xyz', description: '' })
        .expect(201)
    ).body.id as string;
    await owner
      .post(base)
      .send({ name: 'X', email: 'x@example.com', departmentIds: [foreign] })
      .expect(404);
  });

  it('links a person to the one user with their email address', async () => {
    // A user who exists already: linked at once.
    const adaUser = await userCreated('ADA@example.com');
    const adaPerson = (await owner.post(base).send(ada()).expect(201)).body;
    expect(adaPerson.userId).toBe(adaUser);
    await owner
      .get(base)
      .query({ userId: adaUser })
      .expect(200)
      .expect(({ body }) =>
        expect(body.items.map((p: { id: string }) => p.id)).toEqual([
          adaPerson.id,
        ]),
      );

    // A user created later: linked when Pistis announces them.
    const grace = (
      await owner
        .post(base)
        .send({ name: 'Grace', email: 'grace@example.com' })
        .expect(201)
    ).body;
    expect(grace.userId).toBeNull();
    const graceUser = await userCreated('grace@example.com');
    await owner
      .get(`${base}/${grace.id}`)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({ userId: graceUser, version: 2 }),
      );

    // Two users with one address: no one is linked.
    await userCreated('twin@example.com');
    await userCreated('twin@example.com');
    const twin = (
      await owner
        .post(base)
        .send({ name: 'Twin', email: 'twin@example.com' })
        .expect(201)
    ).body;
    expect(twin.userId).toBeNull();

    // A new address links anew; an unknown one unlinks.
    const moved = await owner
      .put(`${base}/${grace.id}`)
      .send({ name: 'Grace', email: 'grace@elsewhere.example' })
      .expect(200);
    expect(moved.body).toMatchObject({ userId: null, version: 3 });

    // Persons in other organizations are linked too, one each.
    const other = await foundOrganization(app, 'globex');
    const there = (
      await (
        await asOwner(app, other.id)
      )
        .post(`/v1/organizations/${other.id}/persons`)
        .send(ada())
        .expect(201)
    ).body;
    expect(there.userId).toBe(adaUser);

    const events = (await outboxEvents(app))
      .filter((e) => e.eventType.startsWith('person.'))
      .filter((e) => e.aggregateId === grace.id)
      .map((e) => [e.eventType, e.aggregateVersion, e.payload]);
    expect(events).toEqual([
      [
        'person.created',
        1,
        { personId: grace.id, userId: null, departmentIds: [] },
      ],
      [
        'person.updated',
        2,
        { personId: grace.id, userId: graceUser, departmentIds: [] },
      ],
      [
        'person.updated',
        3,
        { personId: grace.id, userId: null, departmentIds: [] },
      ],
    ]);
  });

  it("follows a user's new email address", async () => {
    const first = await userCreated('ada@example.com');
    const linked = (await owner.post(base).send(ada()).expect(201)).body;
    expect(linked.userId).toBe(first);
    // A second user with the address doesn't move the link.
    const second = await userCreated('ada@example.com');
    // Someone waiting for the address the first user moves to.
    const waiting = (
      await owner
        .post(base)
        .send({ name: 'Ada at work', email: 'ada@work.example' })
        .expect(201)
    ).body;
    expect(waiting.userId).toBeNull();

    // Disabling the user leaves the link as it is.
    await userChanged('user.disabled', first, 2, 'ada@example.com', 'disabled');
    const person = (id: string) =>
      owner
        .get(`${base}/${id}`)
        .expect(200)
        .then(({ body }) => body);
    expect((await person(linked.id)).userId).toBe(first);

    // The first user's address changes: Ada (still at the old address) goes
    // to the one user left with it, and the waiting person to the first.
    await userChanged('user.updated', first, 3, 'Ada@Work.example');
    expect(await person(linked.id)).toMatchObject({
      userId: second,
      version: 2,
    });
    expect(await person(waiting.id)).toMatchObject({
      userId: first,
      version: 2,
    });

    // An older event arriving late changes nothing.
    await userChanged('user.updated', first, 2, 'ada@example.com');
    expect((await person(waiting.id)).userId).toBe(first);
    expect((await person(linked.id)).userId).toBe(second);
  });

  it('changes and deletes a person', async () => {
    const research = await department('research');
    const id = (await owner.post(base).send(ada()).expect(201)).body
      .id as string;

    const changed = await owner
      .put(`${base}/${id}`)
      .send(ada({ role: 'Analyst', departmentIds: [research] }))
      .expect(200);
    expect(changed.body).toMatchObject({
      role: 'Analyst',
      departmentIds: [research],
      version: 2,
    });
    // The same again: no new version.
    await owner
      .put(`${base}/${id}`)
      .send(ada({ role: 'Analyst', departmentIds: [research] }))
      .expect(200)
      .expect(({ body }) => expect(body.version).toBe(2));

    await owner.delete(`${base}/${id}`).expect(204);
    await owner.get(`${base}/${id}`).expect(404);
    await owner.delete(`${base}/${id}`).expect(404);
    const left = await owner
      .get(base)
      .query({ departmentId: research })
      .expect(200);
    expect(left.body.items).toEqual([]);

    const types = (await outboxEvents(app))
      .filter((e) => e.eventType.startsWith('person.'))
      .map((e) => e.eventType);
    expect(types).toEqual([
      'person.created',
      'person.updated',
      'person.deleted',
    ]);
  });
});
