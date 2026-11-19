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

describe('Project memberships (e2e)', () => {
  let app: INestApplication<App>;
  let orgId: string;
  let projectId: string;
  let owner: Client;
  let base: string;

  beforeEach(async () => {
    app = await createApp();
    orgId = (await foundOrganization(app, 'acme', 'user-0')).id;
    owner = await asOwner(app, orgId, 'user-0');
    projectId = (
      await owner
        .post(`/v1/organizations/${orgId}/projects`)
        .send({ name: 'App', slug: 'app', description: '' })
        .expect(201)
    ).body.id;
    base = `/v1/organizations/${orgId}/projects/${projectId}/memberships`;
  });

  afterEach(async () => {
    await app.close();
  });

  /** Makes `subject` a member of the organization with these roles. */
  const join = (subject: string, roles: string[], subjectType = 'user') =>
    owner
      .post(`/v1/organizations/${orgId}/memberships`)
      .send({ subjectType, subject, roles })
      .expect(201)
      .then((res) => res.body as { id: string });

  const grant = (subject: string, role: string, subjectType = 'user') =>
    owner.post(base).send({ subjectType, subject, role });

  it("gives a project's creator a role in it, unless they're an admin already", async () => {
    await join('user-1', ['member']);
    await join('sa-1', ['member'], 'service_account');
    const projects = `/v1/organizations/${orgId}/projects`;
    const create = async (as: Client, slug: string) =>
      (
        await as
          .post(projects)
          .send({ name: slug, slug, description: '' })
          .expect(201)
      ).body.id as string;
    const rolesIn = async (id: string) =>
      (
        await owner.get(`${projects}/${id}/memberships`).expect(200)
      ).body.items.map(
        (m: {
          subjectType: string;
          subject: string;
          role: string;
          createdBy: string;
        }) => [m.subjectType, m.subject, m.role, m.createdBy],
      );

    // A member: approver, the most a member can be.
    const mine = await create(await asMember(app, orgId, ['member']), 'mine');
    expect(await rolesIn(mine)).toEqual([
      ['user', 'user-1', 'approver', 'user-1'],
    ]);
    // A service account: editor (service accounts never approve).
    const theirs = await create(
      await asMember(app, orgId, ['member'], {
        sub: 'sa-1',
        subType: 'service_account',
      }),
      'theirs',
    );
    expect(await rolesIn(theirs)).toEqual([
      ['service_account', 'sa-1', 'editor', 'sa-1'],
    ]);
    // The owner: none, being an admin of every project.
    expect(await rolesIn(projectId)).toEqual([]);

    const granted = (await outboxEvents(app)).filter(
      (e) => e.eventType === 'project-membership.granted',
    );
    expect(
      granted.map((e) => [e.projectId, (e.payload as { role: string }).role]),
    ).toEqual([
      [mine, 'approver'],
      [theirs, 'editor'],
    ]);
  });

  it('grants, reads, changes and removes a project role', async () => {
    await join('user-1', ['member']);

    const created = await grant('user-1', 'editor').expect(201);
    expect(created.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-7/),
      organizationId: orgId,
      projectId,
      subjectType: 'user',
      subject: 'user-1',
      role: 'editor',
      createdBy: 'user-0',
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    const url = `${base}/${created.body.id}`;

    await owner.get(url).expect(200);
    const updated = await owner.put(url).send({ role: 'approver' }).expect(200);
    expect(updated.body.role).toBe('approver');
    // The same role again changes nothing.
    await owner.put(url).send({ role: 'approver' }).expect(200);

    const list = await owner.get(base).expect(200);
    expect(list.body).toEqual({ items: [updated.body], nextCursor: null });

    await owner.delete(url).expect(204);
    await owner.get(url).expect(404);

    const events = await outboxEvents(app);
    expect(
      events
        .filter((event) => event.eventType.startsWith('project-membership.'))
        .map((event) => [event.eventType, event.projectId, event.payload]),
    ).toEqual([
      [
        'project-membership.granted',
        projectId,
        expect.objectContaining({
          role: 'editor',
          scope: { type: 'project', organizationId: orgId, projectId },
        }),
      ],
      [
        'project-membership.role-changed',
        projectId,
        expect.objectContaining({ from: 'editor', to: 'approver' }),
      ],
      ['project-membership.revoked', projectId, expect.anything()],
    ]);
  });

  it('never grants more than the organization role allows', async () => {
    await join('viewer-1', ['viewer']);
    await join('robot-1', ['member'], 'service_account');

    const capped = await grant('viewer-1', 'editor').expect(409);
    expect(capped.body.code).toBe('PROJECT_ROLE_EXCEEDS_CAP');
    await grant('viewer-1', 'viewer').expect(201);

    // Service accounts never approve.
    const robot = await grant('robot-1', 'approver', 'service_account').expect(
      409,
    );
    expect(robot.body.code).toBe('PROJECT_ROLE_EXCEEDS_CAP');
    await grant('robot-1', 'editor', 'service_account').expect(201);

    // Only members of the organization, and project admin is never granted.
    const outsider = await grant('stranger', 'viewer').expect(409);
    expect(outsider.body.code).toBe('PROJECT_MEMBER_NOT_IN_ORGANIZATION');
    await grant('viewer-1', 'admin').expect(400);

    const duplicate = await grant('viewer-1', 'viewer').expect(409);
    expect(duplicate.body.code).toBe('PROJECT_MEMBERSHIP_EXISTS');
  });

  it('follows the organization role: lowered roles cap grants, leaving removes them', async () => {
    const membership = await join('user-1', ['member']);
    const other = (
      await owner
        .post(`/v1/organizations/${orgId}/projects`)
        .send({ name: 'Other', slug: 'other', description: '' })
        .expect(201)
    ).body.id as string;
    await grant('user-1', 'approver').expect(201);
    await owner
      .post(`/v1/organizations/${orgId}/projects/${other}/memberships`)
      .send({ subjectType: 'user', subject: 'user-1', role: 'viewer' })
      .expect(201);

    await owner
      .put(`/v1/organizations/${orgId}/memberships/${membership.id}`)
      .send({ roles: ['viewer'] })
      .expect(200);
    const capped = await owner.get(base).expect(200);
    expect(capped.body.items).toEqual([
      expect.objectContaining({ subject: 'user-1', role: 'viewer' }),
    ]);

    await owner
      .delete(`/v1/organizations/${orgId}/memberships/${membership.id}`)
      .expect(204);
    await owner.get(base).expect(200, { items: [], nextCursor: null });
    await owner
      .get(`/v1/organizations/${orgId}/projects/${other}/memberships`)
      .expect(200, { items: [], nextCursor: null });
  });

  it('refuses grants in archived projects', async () => {
    await join('user-1', ['member']);
    await owner
      .post(`/v1/organizations/${orgId}/projects/${projectId}/archive`)
      .expect(200);

    const res = await grant('user-1', 'viewer').expect(409);
    expect(res.body.code).toBe('PROJECT_ARCHIVED');
    await owner.get(base).expect(200);
  });

  it('lets project members read, and only project admins manage', async () => {
    await join('user-1', ['member']);
    await grant('user-1', 'editor').expect(201);

    const editor = await asMember(app, orgId, ['member'], {
      sub: 'user-1',
      projectRoles: { [projectId]: 'editor' },
    });
    await editor.get(base).expect(200);
    await editor
      .post(base)
      .send({ subjectType: 'user', subject: 'user-0', role: 'viewer' })
      .expect(403);

    // Without a role in the project, it doesn't exist.
    const outsider = await asMember(app, orgId, ['member'], { sub: 'user-2' });
    await outsider.get(base).expect(404);
    await owner
      .get(`/v1/organizations/${orgId}/projects/${MISSING_ID}/memberships`)
      .expect(404);
  });

  it("lists a principal's project roles for themselves and for Pistis", async () => {
    await join('user-1', ['member']);
    await grant('user-1', 'editor').expect(201);
    const query = {
      organizationId: orgId,
      subjectType: 'user',
      subject: 'user-1',
    };

    const own = await (
      await asMember(app, orgId, ['member'], { sub: 'user-1' })
    )
      .get('/v1/project-memberships')
      .query(query)
      .expect(200);
    expect(own.body.items).toEqual([
      expect.objectContaining({ projectId, role: 'editor' }),
    ]);

    await (
      await asMember(app, orgId, ['member'], { sub: 'user-2' })
    )
      .get('/v1/project-memberships')
      .query(query)
      .expect(403);
    await (
      await asOperator(app)
    )
      .get('/v1/project-memberships')
      .query(query)
      .expect(200);
  });
});
