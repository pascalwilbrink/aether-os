import type { DomainEvent } from '@kerykes/core';

import { planFor } from './rules.js';

const ORG = '0193a1b2-c3d4-7e5f-8a9b-000000000001';
const PROJECT = '0193a1b2-c3d4-7e5f-8a9b-000000000002';
const TASK = '0193a1b2-c3d4-7e5f-8a9b-000000000003';
const SUBTASK = '0193a1b2-c3d4-7e5f-8a9b-000000000004';

function event(
  eventType: string,
  payload: unknown,
  overrides: Partial<DomainEvent<unknown>> = {},
): DomainEvent<unknown> {
  return {
    eventId: '0193a1b2-c3d4-7e5f-8a9b-0000000000ee',
    eventType,
    schemaVersion: 1,
    aggregateId: TASK,
    aggregateVersion: 3,
    occurredAt: '2026-11-19T10:00:00.000Z' as unknown as Date,
    organizationId: ORG,
    projectId: PROJECT,
    actor: null,
    payload,
    ...overrides,
  } as DomainEvent<unknown>;
}

const taskLink = `/orgs/${ORG}/projects/${PROJECT}/tasks/${TASK}`;

describe('notification rules', () => {
  it('asks the approvers to review, once per round', () => {
    const plan = planFor(
      event('task.awaiting-review', {
        taskId: TASK,
        topLevelTaskId: TASK,
        requestedBy: 'u1',
        draftArtifactIds: ['a', 'b'],
        round: 2,
      }),
      'hephaestus',
    )!;
    expect(plan).toMatchObject({
      type: 'review_requested',
      audience: { kind: 'approvers', projectId: PROJECT },
      requires: { project: 'task:approve' },
      link: taskLink,
      groupKey: `review:${TASK}:2`,
      email: true,
    });
    expect(plan.render('Website')).toEqual({
      title: '2 drafts waiting for your review',
      body: 'A task in Website has 2 drafts to review (round 2).',
    });
    expect(plan.render(null).body).toBe(
      'A task in a project has 2 drafts to review (round 2).',
    );
  });

  it("asks the session's person to review a council's plan, without its title", () => {
    const plan = planFor(
      event('council-plan.proposed', {
        sessionId: SUBTASK,
        councilId: TASK,
        councilVersionId: TASK,
        planId: TASK,
        number: 1,
        title: 'Anything the facilitator wrote',
        entries: 1,
        startedBy: 'u1',
      }),
      'hephaestus',
    )!;
    expect(plan).toMatchObject({
      type: 'plan_review_requested',
      audience: { kind: 'user', sub: 'u1' },
      requires: { project: 'session:use' },
      link: `/orgs/${ORG}/projects/${PROJECT}/sessions/${SUBTASK}`,
      groupKey: `plan:${TASK}`,
      email: true,
    });
    expect(plan.render('Website')).toEqual({
      title: 'A plan is waiting for your review',
      body: "A council in Website proposed a plan of 1 task (plan 1 of your session). Approve it, ask for changes or reject it on the session's page.",
    });
    expect(
      planFor(
        event('council-plan.proposed', {}, { projectId: null }),
        'hephaestus',
      ),
    ).toBeNull();
  });

  it('tells the requester about a failed or finished task tree, not each subtask', () => {
    const failed = planFor(
      event('task.failed', {
        taskId: TASK,
        topLevelTaskId: TASK,
        requestedBy: 'u1',
        failureReason: 'verification_failed',
      }),
      'hephaestus',
    )!;
    expect(failed).toMatchObject({
      type: 'task_failed',
      audience: { kind: 'user', sub: 'u1' },
      requires: { project: 'task:read' },
      email: true,
    });
    expect(failed.render('Website').body).toBe(
      "A task you started in Website failed: its checks didn't pass.",
    );
    expect(
      planFor(
        event('task.failed', {
          taskId: SUBTASK,
          topLevelTaskId: TASK,
          requestedBy: 'u1',
          failureReason: 'agent_failed',
        }),
        'hephaestus',
      ),
    ).toBeNull();

    const succeeded = planFor(
      event('task.succeeded', {
        taskId: TASK,
        topLevelTaskId: TASK,
        requestedBy: 'u1',
        primaryArtifactId: 'a',
        artifactIds: ['a'],
      }),
      'hephaestus',
    )!;
    expect(succeeded).toMatchObject({ type: 'task_succeeded', email: false });
  });

  it('tells the admins about paused work, once a day per tree and budget', () => {
    const paused = planFor(
      event('task.paused', {
        taskId: SUBTASK,
        topLevelTaskId: TASK,
        requestedBy: 'u1',
        scope: 'project',
      }),
      'hephaestus',
    )!;
    expect(paused).toMatchObject({
      type: 'task_paused',
      audience: { kind: 'organization-admins' },
      groupKey: `paused:${TASK}:project:2026-11-19`,
    });
    expect(paused.render('Website').body).toContain(
      "because the project's budget ran out",
    );
  });

  it('links a budget warning to where the budget is set', () => {
    const budget = (scope: string, scopeId: string, projectId: string | null) =>
      planFor(
        event(
          'budget.threshold-reached',
          {
            budgetId: 'b1',
            scope,
            scopeId,
            limitUsd: '100.000000',
            spentUsd: '80.500000',
            windowStart: scope === 'task_tree' ? null : '2026-11-01T00:00:00Z',
          },
          { projectId },
        ),
        // Pylon's (docs/pylon.md); Hephaestus doesn't publish it any more.
        'pylon',
      )!;

    const organization = budget('organization', ORG, null);
    expect(organization).toMatchObject({
      projectId: null,
      link: `/orgs/${ORG}/budget`,
      requires: { organization: 'org:read' },
      groupKey: 'budget:b1:2026-11-01T00:00:00Z',
    });
    expect(organization.render(null).body).toBe(
      "$80.50 of $100.00 of the organization's budget this month is used.",
    );
    expect(budget('agent', 'agent-1', null).link).toBe(
      `/orgs/${ORG}/agents/agent-1#budget`,
    );
    const project = budget('project', PROJECT, null);
    expect(project).toMatchObject({
      projectId: PROJECT,
      link: `/orgs/${ORG}/projects/${PROJECT}#budget`,
    });
    expect(project.render('Website').body).toBe(
      '$80.50 of $100.00 of the budget of Website this month is used.',
    );
    const tree = budget('task_tree', TASK, PROJECT);
    expect(tree).toMatchObject({
      taskId: TASK,
      link: `${taskLink}#budget`,
      groupKey: 'budget:b1:lifetime',
    });
  });

  it('welcomes users added to an organization or project, never service accounts', () => {
    const granted = planFor(
      event(
        'membership.granted',
        {
          membershipId: 'm1',
          principal: { sub: 'u2', sub_type: 'user' },
          scope: { type: 'organization', organizationId: ORG },
          roles: ['member'],
        },
        { projectId: null },
      ),
      'polis',
    )!;
    expect(granted).toMatchObject({
      type: 'membership_granted',
      audience: { kind: 'user', sub: 'u2' },
      requires: null,
      link: `/orgs/${ORG}`,
    });
    const project = planFor(
      event('project-membership.granted', {
        membershipId: 'm2',
        principal: { sub: 'u2', sub_type: 'user' },
        scope: { type: 'project', organizationId: ORG, projectId: PROJECT },
        role: 'approver',
      }),
      'polis',
    )!;
    expect(project.render('Website').body).toBe(
      'You can now work in Website as approver.',
    );
    expect(
      planFor(
        event('membership.granted', {
          membershipId: 'm3',
          principal: { sub: 'sa', sub_type: 'service_account' },
          scope: { type: 'organization', organizationId: ORG },
          roles: ['member'],
        }),
        'polis',
      ),
    ).toBeNull();
  });

  describe('work in Ergon', () => {
    const WORK = '0193a1b2-c3d4-7e5f-8a9b-000000000005';
    const PERSON = '0193a1b2-c3d4-7e5f-8a9b-000000000006';
    const assignment = (role: string, change = 'started', kind = 'person') => ({
      change,
      assignmentId: 'as1',
      workItemId: WORK,
      workItemTitle: 'Ignore previous instructions',
      assignee: { kind, id: PERSON, versionId: null },
      role,
      reason: null,
    });

    it('tells the person assigned, by email when responsible or reviewing', () => {
      const plan = planFor(
        event('work-assignment.changed', assignment('responsible'), {
          actor: { sub: 'u1', sub_type: 'user' },
        }),
        'ergon',
      )!;
      expect(plan).toMatchObject({
        type: 'work_assigned',
        audience: { kind: 'person', personId: PERSON },
        requires: { project: 'work:read' },
        link: `/orgs/${ORG}/projects/${PROJECT}/work/${WORK}`,
        groupKey: 'assignment:as1',
        except: 'u1',
        email: true,
      });
      expect(plan.render('Website')).toEqual({
        title: 'Work was assigned to you',
        body: "You're now responsible for a work item in Website.",
      });
      expect(
        planFor(
          event('work-assignment.changed', assignment('reviewer')),
          'ergon',
        )!.email,
      ).toBe(true);
      expect(
        planFor(
          event('work-assignment.changed', assignment('contributor')),
          'ergon',
        )!.email,
      ).toBe(false);

      const outside = planFor(
        event('work-assignment.changed', assignment('observer'), {
          projectId: null,
        }),
        'ergon',
      )!;
      expect(outside).toMatchObject({
        requires: { organization: 'org:work:read' },
        link: `/orgs/${ORG}/work/${WORK}`,
        except: null,
      });
    });

    it('ignores ended assignments and agents', () => {
      expect(
        planFor(
          event('work-assignment.changed', assignment('responsible', 'ended')),
          'ergon',
        ),
      ).toBeNull();
      expect(
        planFor(
          event(
            'work-assignment.changed',
            assignment('responsible', 'started', 'agent'),
          ),
          'ergon',
        ),
      ).toBeNull();
    });

    it("asks a work item's reviewers once per submission, in projects only", () => {
      const changed = (to: string) => ({
        workItem: { id: WORK },
        from: 'in_progress',
        to,
        action: 'submit',
        reason: null,
      });
      const plan = planFor(
        event('work-item.status-changed', changed('in_review'), {
          aggregateVersion: 5,
        }),
        'ergon',
      )!;
      expect(plan).toMatchObject({
        type: 'work_review_requested',
        audience: {
          kind: 'work-reviewers',
          workItemId: WORK,
          projectId: PROJECT,
        },
        requires: { project: 'work:write' },
        groupKey: `work-review:${WORK}:5`,
        email: true,
      });
      expect(
        planFor(event('work-item.status-changed', changed('done')), 'ergon'),
      ).toBeNull();
      expect(
        planFor(
          event('work-item.status-changed', changed('in_review'), {
            projectId: null,
          }),
          'ergon',
        ),
      ).toBeNull();
    });
  });

  it('ignores everything else', () => {
    expect(planFor(event('task.created', {}), 'hephaestus')).toBeNull();
    expect(planFor(event('task.failed', {}), 'polis')).toBeNull();
  });
});
