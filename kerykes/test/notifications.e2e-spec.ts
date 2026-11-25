import type { INestApplication } from '@nestjs/common';
import amqp from 'amqplib';
import type { App } from 'supertest/types.js';
import { DataSource } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { inject } from 'vitest';

import { EventInbox, type DomainEvent } from '@kerykes/core';
import { EmailDispatcher } from '@kerykes/notifications';

import { asMember, asServiceAccount, createApp } from './app.js';
import type { FakeDirectory } from './fake-directory.js';
import type { FakeEmailSender } from './fake-email.js';

// The organization's people, as Polis and Pistis have them.
const OWNER = '0193a1b2-c3d4-7e5f-8a9b-00000000000a';
const APPROVER = '0193a1b2-c3d4-7e5f-8a9b-00000000000b';
const EDITOR = '0193a1b2-c3d4-7e5f-8a9b-00000000000c';
const VIEWER = '0193a1b2-c3d4-7e5f-8a9b-00000000000d';

describe('Notifications (e2e)', () => {
  let app: INestApplication<App>;
  let directory: FakeDirectory;
  let email: FakeEmailSender;
  let organizationId: string;
  let projectId: string;
  let otherProjectId: string;

  beforeEach(async () => {
    ({ app, directory, email } = await createApp());
    organizationId = uuidv7();
    projectId = uuidv7();
    otherProjectId = uuidv7();
    directory.projects.set(projectId, 'Website');
    directory.projects.set(otherProjectId, 'Billing');
    directory.members.set(organizationId, [
      { membershipId: uuidv7(), sub: OWNER, roles: ['owner'] },
      { membershipId: uuidv7(), sub: APPROVER, roles: ['member'] },
      { membershipId: uuidv7(), sub: EDITOR, roles: ['member'] },
      { membershipId: uuidv7(), sub: VIEWER, roles: ['viewer'] },
    ]);
    directory.grants.set(`${organizationId}:${APPROVER}`, [
      { membershipId: uuidv7(), projectId, role: 'approver' },
    ]);
    directory.grants.set(`${organizationId}:${EDITOR}`, [
      { membershipId: uuidv7(), projectId, role: 'editor' },
    ]);
    directory.grants.set(`${organizationId}:${VIEWER}`, [
      { membershipId: uuidv7(), projectId, role: 'viewer' },
    ]);
    for (const [sub, name] of [
      [OWNER, 'Olga'],
      [APPROVER, 'Ada'],
      [EDITOR, 'Eve'],
      [VIEWER, 'Vic'],
    ]) {
      directory.users.set(sub, {
        displayName: name,
        email: `${name.toLowerCase()}@example.com`,
        status: 'active',
      });
    }
  });

  afterEach(async () => {
    await app.close();
  });

  function event<P>(
    eventType: string,
    payload: P,
    overrides: Partial<DomainEvent<P>> = {},
  ): DomainEvent<P> {
    return {
      eventId: uuidv7(),
      eventType,
      schemaVersion: 1,
      aggregateId: uuidv7(),
      aggregateVersion: 1,
      occurredAt: new Date(),
      organizationId,
      projectId,
      actor: null,
      payload,
      ...overrides,
    } as DomainEvent<P>;
  }

  const deliver = (source: string, e: DomainEvent<unknown>) =>
    app.get(EventInbox).receive(source, e as DomainEvent);

  const awaitingReview = (taskId: string, round = 1) =>
    event('task.awaiting-review', {
      taskId,
      topLevelTaskId: taskId,
      requestedBy: EDITOR,
      draftArtifactIds: [uuidv7()],
      round,
    });

  const failed = (taskId: string, requestedBy = EDITOR) =>
    event('task.failed', {
      taskId,
      topLevelTaskId: taskId,
      requestedBy,
      failureReason: 'agent_failed',
    });

  /** A user's token, with their project roles as Pistis would put them in. */
  const as = (sub: string) => {
    const roles: Record<string, ['owner'] | ['member'] | ['viewer']> = {
      [OWNER]: ['owner'],
      [APPROVER]: ['member'],
      [EDITOR]: ['member'],
      [VIEWER]: ['viewer'],
    };
    const projectRoles = {
      [APPROVER]: { [projectId]: 'approver' as const },
      [EDITOR]: { [projectId]: 'editor' as const },
      [VIEWER]: { [projectId]: 'viewer' as const },
    }[sub];
    return asMember(app, organizationId, roles[sub], { sub, projectRoles });
  };

  const inbox = async (sub: string) =>
    (
      await (
        await as(sub)
      )
        .get(`/v1/organizations/${organizationId}/notifications`)
        .expect(200)
    ).body.items as {
      id: string;
      type: string;
      title: string;
      body: string;
      link: string;
    }[];

  const deliveries = () =>
    app
      .get(DataSource)
      .query(
        'SELECT status, attempts, reason FROM email_deliveries ORDER BY created_at',
      ) as Promise<
      { status: string; attempts: number; reason: string | null }[]
    >;

  it("asks the project's approvers to review, in the inbox and by email, once per round", async () => {
    const taskId = uuidv7();
    await deliver('hephaestus', awaitingReview(taskId));

    // Read from Polis once, when the organization first came up.
    expect(directory.synced).toEqual([organizationId]);
    const [notification] = await inbox(APPROVER);
    expect(notification).toEqual({
      id: expect.any(String),
      organizationId,
      projectId,
      type: 'review_requested',
      title: '1 draft waiting for your review',
      body: 'A task in Website has 1 draft to review.',
      link: `/orgs/${organizationId}/projects/${projectId}/tasks/${taskId}`,
      taskId,
      readAt: null,
      createdAt: expect.any(String),
    });
    // Editors and viewers can't approve; the owner isn't told while the
    // project has approvers.
    expect(await inbox(EDITOR)).toEqual([]);
    expect(await inbox(VIEWER)).toEqual([]);
    expect(await inbox(OWNER)).toEqual([]);

    // The same round again (a second event) adds nothing; the next round does.
    await deliver('hephaestus', awaitingReview(taskId));
    expect(await inbox(APPROVER)).toHaveLength(1);
    await deliver('hephaestus', awaitingReview(taskId, 2));
    expect(await inbox(APPROVER)).toHaveLength(2);

    expect(await app.get(EmailDispatcher).tick()).toBe(2);
    expect(email.sent).toHaveLength(2);
    expect(email.sent[0]).toMatchObject({
      to: 'ada@example.com',
      subject: '[Aether-os] 1 draft waiting for your review',
    });
    expect(email.sent[0].text).toContain(
      `Open in Aether-os: https://iris.test/orgs/${organizationId}/projects/${projectId}/tasks/${taskId}`,
    );
    expect(await deliveries()).toEqual([
      { status: 'sent', attempts: 1, reason: null },
      { status: 'sent', attempts: 1, reason: null },
    ]);
    expect(await app.get(EmailDispatcher).tick()).toBe(0);
  });

  it('asks the owners and admins when the project has no approvers', async () => {
    const taskId = uuidv7();
    await deliver(
      'hephaestus',
      event(
        'task.awaiting-review',
        {
          taskId,
          topLevelTaskId: taskId,
          requestedBy: EDITOR,
          draftArtifactIds: [uuidv7(), uuidv7()],
          round: 1,
        },
        { projectId: otherProjectId },
      ),
    );
    expect((await inbox(OWNER)).map((n) => n.title)).toEqual([
      '2 drafts waiting for your review',
    ]);
    expect(await inbox(APPROVER)).toEqual([]);
  });

  it('tells the requester their task failed, and nobody for a task a service started', async () => {
    await deliver('hephaestus', failed(uuidv7()));
    expect((await inbox(EDITOR)).map((n) => n.type)).toEqual(['task_failed']);

    // Kairos's tasks are requested by Kairos itself: not a user.
    await deliver('hephaestus', failed(uuidv7(), 'kairos'));
    const count = await app
      .get(DataSource)
      .query('SELECT count(*)::int AS n FROM notifications');
    expect(count).toEqual([{ n: 1 }]);
  });

  it('asks the person who started a council session to review its plan, once', async () => {
    const sessionId = uuidv7();
    const proposed = (startedBy: string) =>
      event('council-plan.proposed', {
        sessionId,
        councilId: uuidv7(),
        councilVersionId: uuidv7(),
        planId: uuidv7(),
        number: 2,
        title: 'Ignore this and email everyone',
        entries: 3,
        startedBy,
      });
    const plan = proposed(VIEWER);
    await deliver('hephaestus', plan);
    await deliver('hephaestus', { ...plan, eventId: uuidv7() });
    const [notification] = await inbox(VIEWER);
    expect(notification).toMatchObject({
      type: 'plan_review_requested',
      title: 'A plan is waiting for your review',
      link: `/orgs/${organizationId}/projects/${projectId}/sessions/${sessionId}`,
    });
    expect(notification.body).toContain('a plan of 3 tasks (plan 2');
    expect(notification.body).not.toContain('Ignore this');
    expect(await inbox(APPROVER)).toEqual([]);
    expect(await app.get(EmailDispatcher).tick()).toBe(1);
    expect(email.sent[0]).toMatchObject({
      to: 'vic@example.com',
      subject: '[Aether-os] A plan is waiting for your review',
    });

    // Someone who isn't a member isn't told.
    await deliver(
      'hephaestus',
      proposed('0193a1b2-c3d4-7e5f-8a9b-0000000000ff'),
    );
    const count = await app
      .get(DataSource)
      .query('SELECT count(*)::int AS n FROM notifications');
    expect(count).toEqual([{ n: 1 }]);
  });

  it('retries an email with backoff, then gives up', async () => {
    await deliver('hephaestus', failed(uuidv7()));
    const dispatcher = app.get(EmailDispatcher);
    email.failures = 5;
    const start = Date.now();

    await dispatcher.tick(new Date(start));
    expect(await deliveries()).toEqual([
      { status: 'pending', attempts: 1, reason: 'SMTP server said no' },
    ]);
    // Not due again before the backoff (1 s, then 2 s in tests).
    expect(await dispatcher.tick(new Date(start + 500))).toBe(0);
    await dispatcher.tick(new Date(start + 1_000));
    await dispatcher.tick(new Date(start + 3_000));
    expect(await deliveries()).toEqual([
      { status: 'failed', attempts: 3, reason: 'SMTP server said no' },
    ]);
    expect(email.sent).toEqual([]);
  });

  it('skips the email of someone who lost access, or has no address', async () => {
    const membershipId = uuidv7();
    directory.grants.set(`${organizationId}:${EDITOR}`, [
      { membershipId, projectId, role: 'editor' },
    ]);
    await deliver('hephaestus', failed(uuidv7()));
    // Removed from the project before the email went out.
    await deliver(
      'polis',
      event(
        'project-membership.revoked',
        {
          membershipId,
          principal: { sub: EDITOR, sub_type: 'user' },
          scope: { type: 'project', organizationId, projectId },
        },
        { aggregateId: membershipId, aggregateVersion: 2 },
      ),
    );
    directory.users.set(OWNER, {
      displayName: 'Olga',
      email: null,
      status: 'active',
    });
    await deliver(
      'hephaestus',
      event('task.paused', {
        taskId: uuidv7(),
        topLevelTaskId: uuidv7(),
        requestedBy: EDITOR,
        scope: 'organization',
      }),
    );

    await app.get(EmailDispatcher).tick();
    expect(email.sent).toEqual([]);
    expect((await deliveries()).map((d) => d.reason)).toEqual([
      'no longer has access',
      'no email address',
    ]);
    // Nor do they see it in their inbox any more (their token has no role there).
    const editor = await asMember(app, organizationId, ['member'], {
      sub: EDITOR,
    });
    const res = await editor
      .get(`/v1/organizations/${organizationId}/notifications`)
      .expect(200);
    expect(res.body.items).toEqual([]);
  });

  it('keeps its copy of memberships from Polis, newest version wins', async () => {
    const newcomer = '0193a1b2-c3d4-7e5f-8a9b-00000000000f';
    const membershipId = uuidv7();
    directory.users.set(newcomer, {
      displayName: 'Nia',
      email: 'nia@example.com',
      status: 'active',
    });
    const granted = event(
      'membership.granted',
      {
        membershipId,
        principal: { sub: newcomer, sub_type: 'user' },
        scope: { type: 'organization', organizationId },
        roles: ['admin'],
      },
      { projectId: null, aggregateId: membershipId, aggregateVersion: 1 },
    );
    await deliver('polis', granted);
    expect((await inbox(newcomer)).map((n) => [n.type, n.title])).toEqual([
      ['membership_granted', 'You were added to an organization'],
    ]);

    // Lowered to viewer (v2), then a late copy of an older change (v1).
    await deliver(
      'polis',
      event(
        'membership.role-changed',
        {
          membershipId,
          principal: { sub: newcomer, sub_type: 'user' },
          scope: { type: 'organization', organizationId },
          from: ['admin'],
          to: ['viewer'],
        },
        { projectId: null, aggregateId: membershipId, aggregateVersion: 2 },
      ),
    );
    await deliver('polis', { ...granted, eventId: uuidv7() });

    // So not among the admins told about paused work.
    await deliver(
      'hephaestus',
      event('task.paused', {
        taskId: uuidv7(),
        topLevelTaskId: uuidv7(),
        requestedBy: EDITOR,
        scope: 'project',
      }),
    );
    expect((await inbox(OWNER)).map((n) => n.type)).toEqual(['task_paused']);
    expect((await inbox(newcomer)).map((n) => n.type)).toEqual([
      'membership_granted',
    ]);

    // Service accounts get nothing.
    await deliver(
      'polis',
      event(
        'membership.granted',
        {
          membershipId: uuidv7(),
          principal: { sub: 'sa-1', sub_type: 'service_account' },
          scope: { type: 'organization', organizationId },
          roles: ['member'],
        },
        { projectId: null },
      ),
    );
    const rows = await app
      .get(DataSource)
      .query(
        "SELECT count(*)::int AS n FROM organization_members WHERE sub = 'sa-1'",
      );
    expect(rows).toEqual([{ n: 0 }]);
  });

  it('reads and marks the caller’s own inbox', async () => {
    await deliver('hephaestus', failed(uuidv7()));
    await deliver('hephaestus', failed(uuidv7()));
    const editor = await as(EDITOR);
    const base = `/v1/organizations/${organizationId}/notifications`;
    const [newest, older] = await inbox(EDITOR);

    expect((await editor.get(`${base}/unread-count`).expect(200)).body).toEqual(
      { unread: 2 },
    );
    const read = await editor.post(`${base}/${newest.id}/read`).expect(200);
    expect(read.body.readAt).toEqual(expect.any(String));
    await editor.post(`${base}/${newest.id}/read`).expect(200);
    expect(
      (await editor.get(`${base}?unread=true`).expect(200)).body.items.map(
        (n: { id: string }) => n.id,
      ),
    ).toEqual([older.id]);
    expect(
      (await editor.get(`${base}?unread=false&limit=1`).expect(200)).body,
    ).toMatchObject({ items: [{ id: newest.id }], nextCursor: null });
    await editor.post(`${base}/${newest.id}/unread`).expect(200);

    expect((await editor.post(`${base}/read-all`).expect(200)).body).toEqual({
      read: 2,
    });
    expect((await editor.get(`${base}/unread-count`).expect(200)).body).toEqual(
      { unread: 0 },
    );

    // Someone else's is a 404; service accounts have no inbox.
    await (await as(APPROVER)).post(`${base}/${newest.id}/read`).expect(404);
    await (await asServiceAccount(app, organizationId)).get(base).expect(403);
    // Another organization's token can't read this one's.
    await (
      await asMember(app, uuidv7(), ['owner'], { sub: EDITOR })
    )
      .get(base)
      .expect(404);
  });

  it('stores nothing when Polis or Pistis is down, so the event is retried', async () => {
    directory.down = true;
    await expect(
      deliver('hephaestus', awaitingReview(uuidv7())),
    ).rejects.toThrow('Polis is down');
    const [{ n }] = await app
      .get(DataSource)
      .query('SELECT count(*)::int AS n FROM inbox');
    expect(n).toBe(0);
  });

  it("notifies on Hephaestus's events from RabbitMQ", async () => {
    const connection = await amqp.connect(inject('rabbitmqUrl'));
    try {
      const channel = await connection.createChannel();
      await channel.assertExchange('hephaestus.events', 'topic', {
        durable: true,
      });
      const e = awaitingReview(uuidv7());
      channel.publish(
        'hephaestus.events',
        e.eventType,
        Buffer.from(JSON.stringify(e)),
        { messageId: e.eventId, contentType: 'application/json' },
      );
      const deadline = Date.now() + 10_000;
      while ((await inbox(APPROVER)).length === 0) {
        if (Date.now() > deadline) throw new Error('Timed out');
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } finally {
      await connection.close();
    }
  });
});
