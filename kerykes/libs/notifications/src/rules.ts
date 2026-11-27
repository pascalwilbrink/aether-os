import type {
  DomainEvent,
  ErgonEvents,
  HephaestusEvents,
  PylonEvents,
  OrganizationPermission,
  PolisEvents,
  ProjectPermission,
} from '@kerykes/core';

import type { NotificationType } from './notification.entities.js';

type Hephaestus = HephaestusEvents.HephaestusEventPayloads;
type Pylon = PylonEvents.PylonEventPayloads;
type Polis = PolisEvents.PolisEventPayloads;
type Ergon = ErgonEvents.ErgonEventPayloads;

/** Who a notification is for, before the permission check. */
export type Audience =
  /** One user: a task's requester, or someone just added. */
  | { kind: 'user'; sub: string }
  /** The project's approvers (organization admins when it has none). */
  | { kind: 'approvers'; projectId: string }
  /** The organization's owners and admins. */
  | { kind: 'organization-admins' }
  /** A person of the organization (Polis), through the user they're linked to. */
  | { kind: 'person'; personId: string }
  /**
   * Who reviews a work item in a project (Ergon): its reviewers, else the
   * person responsible for it, else the project's approvers; at each step
   * leaving out whoever caused the event.
   */
  | { kind: 'work-reviewers'; workItemId: string; projectId: string };

/**
 * What to tell whom about one event (docs/notifications.md,
 * Notifications), decided from the event alone; `NotificationsService`
 * resolves the audience, checks each recipient still holds `requires`, and
 * stores and sends it.
 */
export interface NotificationPlan {
  type: NotificationType;
  organizationId: string;
  projectId: string | null;
  taskId: string | null;
  audience: Audience;
  /**
   * What a recipient must hold now; null when the event itself grants it (a
   * new membership, which Kerykes's copy may not have applied yet). Emails
   * check again before they go (`NotificationsService.mayReceive`).
   */
  requires:
    | { project: ProjectPermission }
    | { organization: OrganizationPermission }
    | null;
  /** A path in Iris. */
  link: string;
  /** One notification per recipient and key. */
  groupKey: string;
  /** A user not to tell, because they did it themselves (Ergon's events). */
  except?: string | null;
  email: boolean;
  /**
   * The words, from Aether-os's own data only: never a task's title (it can
   * come from an issue, untrusted), an issue, or anything an agent wrote.
   */
  render(projectName: string | null): { title: string; body: string };
}

const FAILURE_REASONS: Record<
  Hephaestus['task.failed']['failureReason'],
  string
> = {
  agent_failed: 'the agent gave up',
  verification_failed: "its checks didn't pass",
  rejected: 'a reviewer rejected its outcome',
  timeout: 'it ran out of time',
  budget_exceeded: 'its budget ran out',
  infrastructure: 'Aether-os could not run it',
  subtask_failed: 'one of its subtasks failed',
  access_denied: "its service account isn't allowed to run it",
};

const BUDGET_SCOPES: Record<Hephaestus['task.paused']['scope'], string> = {
  organization: "the organization's",
  project: "the project's",
  agent: "the agent's",
  task_tree: "the task's",
};

const inProject = (projectName: string | null) =>
  projectName ? `in ${projectName}` : 'in a project';

const taskLink = (organizationId: string, projectId: string, taskId: string) =>
  `/orgs/${organizationId}/projects/${projectId}/tasks/${taskId}`;

function usd(amount: string): string {
  const value = Number(amount);
  return Number.isFinite(value) ? `$${value.toFixed(2)}` : `$${amount}`;
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** The plan for one event, or null when it tells nobody anything. */
export function planFor(
  event: DomainEvent<unknown>,
  source: string,
): NotificationPlan | null {
  const key = `${source}.${event.eventType}`;
  switch (key) {
    case 'hephaestus.task.awaiting-review':
      return reviewRequested(
        event as DomainEvent<Hephaestus['task.awaiting-review']>,
      );
    case 'hephaestus.task.failed':
      return taskFailed(event as DomainEvent<Hephaestus['task.failed']>);
    case 'hephaestus.task.succeeded':
      return taskSucceeded(event as DomainEvent<Hephaestus['task.succeeded']>);
    case 'hephaestus.task.paused':
      return taskPaused(event as DomainEvent<Hephaestus['task.paused']>);
    case 'hephaestus.council-plan.proposed':
      return planProposed(
        event as DomainEvent<Hephaestus['council-plan.proposed']>,
      );
    case 'pylon.budget.threshold-reached':
      return budgetThreshold(
        event as DomainEvent<Pylon['budget.threshold-reached']>,
      );
    case 'polis.membership.granted':
      return membershipGranted(
        event as DomainEvent<Polis['membership.granted']>,
      );
    case 'polis.project-membership.granted':
      return projectMembershipGranted(
        event as DomainEvent<Polis['project-membership.granted']>,
      );
    case 'ergon.work-assignment.changed':
      return workAssigned(
        event as DomainEvent<Ergon['work-assignment.changed']>,
      );
    case 'ergon.work-item.status-changed':
      return workReviewRequested(
        event as DomainEvent<Ergon['work-item.status-changed']>,
      );
    default:
      return null;
  }
}

/** Drafts waiting: one notification per task and review round. */
function reviewRequested(
  event: DomainEvent<Hephaestus['task.awaiting-review']>,
): NotificationPlan | null {
  const { organizationId, projectId, payload } = event;
  if (!organizationId || !projectId) return null;
  const drafts = payload.draftArtifactIds.length;
  return {
    type: 'review_requested',
    organizationId,
    projectId,
    taskId: payload.taskId,
    audience: { kind: 'approvers', projectId },
    requires: { project: 'task:approve' },
    link: taskLink(organizationId, projectId, payload.taskId),
    groupKey: `review:${payload.taskId}:${payload.round}`,
    email: true,
    render: (projectName) => ({
      title: `${plural(drafts, 'draft')} waiting for your review`,
      body:
        `A task ${inProject(projectName)} has ${plural(drafts, 'draft')} to review` +
        (payload.round > 1 ? ` (round ${payload.round}).` : '.'),
    }),
  };
}

/**
 * A council's plan waiting for the person who started the session, the only
 * one who can decide on it (docs/councils.md, Planning and delegation); once
 * per plan. Never its title: the facilitator wrote it.
 */
function planProposed(
  event: DomainEvent<Hephaestus['council-plan.proposed']>,
): NotificationPlan | null {
  const { organizationId, projectId, payload } = event;
  if (!organizationId || !projectId) return null;
  return {
    type: 'plan_review_requested',
    organizationId,
    projectId,
    taskId: null,
    audience: { kind: 'user', sub: payload.startedBy },
    requires: { project: 'session:use' },
    link: `/orgs/${organizationId}/projects/${projectId}/sessions/${payload.sessionId}`,
    groupKey: `plan:${payload.planId}`,
    email: true,
    render: (projectName) => ({
      title: 'A plan is waiting for your review',
      body: `A council ${inProject(projectName)} proposed a plan of ${plural(payload.entries, 'task')} (plan ${payload.number} of your session). Approve it, ask for changes or reject it on the session's page.`,
    }),
  };
}

/**
 * A failed task tree: told once, for its top-level task (a subtask's
 * failure fails its parents too), to the person who started it.
 */
function taskFailed(
  event: DomainEvent<Hephaestus['task.failed']>,
): NotificationPlan | null {
  const { organizationId, projectId, payload } = event;
  if (
    !organizationId ||
    !projectId ||
    payload.taskId !== payload.topLevelTaskId
  ) {
    return null;
  }
  return {
    type: 'task_failed',
    organizationId,
    projectId,
    taskId: payload.taskId,
    audience: { kind: 'user', sub: payload.requestedBy },
    requires: { project: 'task:read' },
    link: taskLink(organizationId, projectId, payload.taskId),
    // Each failure: a retried task can fail again.
    groupKey: `failed:${payload.taskId}:${event.eventId}`,
    email: true,
    render: (projectName) => ({
      title: 'A task failed',
      body: `A task you started ${inProject(projectName)} failed: ${FAILURE_REASONS[payload.failureReason]}.`,
    }),
  };
}

/** A finished task tree, in the inbox only, for whoever started it. */
function taskSucceeded(
  event: DomainEvent<Hephaestus['task.succeeded']>,
): NotificationPlan | null {
  const { organizationId, projectId, payload } = event;
  if (
    !organizationId ||
    !projectId ||
    payload.taskId !== payload.topLevelTaskId
  ) {
    return null;
  }
  return {
    type: 'task_succeeded',
    organizationId,
    projectId,
    taskId: payload.taskId,
    audience: { kind: 'user', sub: payload.requestedBy },
    requires: { project: 'task:read' },
    link: taskLink(organizationId, projectId, payload.taskId),
    groupKey: `succeeded:${payload.taskId}`,
    email: false,
    render: (projectName) => ({
      title: 'A task finished',
      body: `A task you started ${inProject(projectName)} succeeded.`,
    }),
  };
}

/**
 * Paused work, for whoever can raise the budget: the organization's owners
 * and admins (a project's admins are them too). Once per task tree and
 * budget a day, however many of its tasks pause.
 */
function taskPaused(
  event: DomainEvent<Hephaestus['task.paused']>,
): NotificationPlan | null {
  const { organizationId, projectId, payload } = event;
  if (!organizationId || !projectId) return null;
  // A Date when emitted locally, an ISO string when it came over RabbitMQ.
  const day = new Date(event.occurredAt).toISOString().slice(0, 10);
  return {
    type: 'task_paused',
    organizationId,
    projectId,
    taskId: payload.taskId,
    audience: { kind: 'organization-admins' },
    requires: { project: 'task:read' },
    link: taskLink(organizationId, projectId, payload.taskId),
    groupKey: `paused:${payload.topLevelTaskId}:${payload.scope}:${day}`,
    email: true,
    render: (projectName) => ({
      title: 'Work paused: a budget ran out',
      body: `A task ${inProject(projectName)} paused because ${BUDGET_SCOPES[payload.scope]} budget ran out. It resumes when the budget has room again.`,
    }),
  };
}

/** 80% of a budget used, for the organization's owners and admins; once per budget and window. */
function budgetThreshold(
  event: DomainEvent<Pylon['budget.threshold-reached']>,
): NotificationPlan | null {
  const { organizationId, payload } = event;
  if (!organizationId) return null;
  const projectId =
    payload.scope === 'project'
      ? payload.scopeId
      : payload.scope === 'task_tree'
        ? event.projectId
        : null;
  if (payload.scope === 'task_tree' && !projectId) return null;
  const link =
    payload.scope === 'organization'
      ? `/orgs/${organizationId}/budget`
      : payload.scope === 'agent'
        ? `/orgs/${organizationId}/agents/${payload.scopeId}#budget`
        : payload.scope === 'project'
          ? `/orgs/${organizationId}/projects/${payload.scopeId}#budget`
          : `${taskLink(organizationId, projectId!, payload.scopeId)}#budget`;
  return {
    type: 'budget_threshold',
    organizationId,
    projectId,
    taskId: payload.scope === 'task_tree' ? payload.scopeId : null,
    audience: { kind: 'organization-admins' },
    requires: projectId
      ? { project: 'task:read' }
      : { organization: 'org:read' },
    link,
    groupKey: `budget:${payload.budgetId}:${payload.windowStart ?? 'lifetime'}`,
    email: true,
    render: (projectName) => ({
      title: 'A budget is nearly used',
      body:
        `${usd(payload.spentUsd)} of ${usd(payload.limitUsd)} of ` +
        (payload.scope === 'project'
          ? `the budget of ${projectName ?? 'a project'}`
          : payload.scope === 'task_tree'
            ? `a task's budget ${inProject(projectName)}`
            : `${BUDGET_SCOPES[payload.scope]} budget`) +
        (payload.windowStart ? ' this month' : '') +
        ' is used.',
    }),
  };
}

function membershipGranted(
  event: DomainEvent<Polis['membership.granted']>,
): NotificationPlan | null {
  const { payload } = event;
  if (payload.principal.sub_type !== 'user') return null;
  const organizationId = payload.scope.organizationId;
  return {
    type: 'membership_granted',
    organizationId,
    projectId: null,
    taskId: null,
    audience: { kind: 'user', sub: payload.principal.sub },
    requires: null,
    link: `/orgs/${organizationId}`,
    groupKey: `membership:${payload.membershipId}`,
    email: true,
    render: () => ({
      title: 'You were added to an organization',
      body: `You can now work in it as ${payload.roles.join(', ')}.`,
    }),
  };
}

function projectMembershipGranted(
  event: DomainEvent<Polis['project-membership.granted']>,
): NotificationPlan | null {
  const { payload } = event;
  if (payload.principal.sub_type !== 'user') return null;
  const { organizationId, projectId } = payload.scope;
  return {
    type: 'membership_granted',
    organizationId,
    projectId,
    taskId: null,
    audience: { kind: 'user', sub: payload.principal.sub },
    requires: null,
    link: `/orgs/${organizationId}/projects/${projectId}`,
    groupKey: `project-membership:${payload.membershipId}`,
    email: true,
    render: (projectName) => ({
      title: 'You were added to a project',
      body: `You can now work ${inProject(projectName)} as ${payload.role}.`,
    }),
  };
}

const workLink = (
  organizationId: string,
  projectId: string | null,
  workItemId: string,
) =>
  projectId
    ? `/orgs/${organizationId}/projects/${projectId}/work/${workItemId}`
    : `/orgs/${organizationId}/work/${workItemId}`;

/** The user who caused an event, when it was one. */
const userActor = (event: DomainEvent<unknown>): string | null =>
  event.actor?.sub_type === 'user' ? event.actor.sub : null;

const WORK_ROLES: Record<
  Ergon['work-assignment.changed']['role'],
  { title: string; as: string }
> = {
  responsible: {
    title: 'Work was assigned to you',
    as: "You're now responsible for a work item",
  },
  reviewer: {
    title: "You're asked to review work",
    as: "You're now a reviewer of a work item",
  },
  contributor: {
    title: 'You were added to work',
    as: "You're now contributing to a work item",
  },
  observer: {
    title: "You're following work",
    as: "You're now following a work item",
  },
};

/**
 * A person given a role on work in Ergon, told through the user they're
 * linked to (nobody when they haven't signed up); not when they assigned
 * themselves. Emailed when they're responsible for it or review it. Never
 * the work's title or the reason: an agent or an issue can have written
 * them.
 */
function workAssigned(
  event: DomainEvent<Ergon['work-assignment.changed']>,
): NotificationPlan | null {
  const { organizationId, projectId, payload } = event;
  if (
    !organizationId ||
    payload.change !== 'started' ||
    payload.assignee.kind !== 'person'
  ) {
    return null;
  }
  const role = WORK_ROLES[payload.role];
  return {
    type: 'work_assigned',
    organizationId,
    projectId,
    taskId: null,
    audience: { kind: 'person', personId: payload.assignee.id },
    requires: projectId
      ? { project: 'work:read' }
      : { organization: 'org:work:read' },
    link: workLink(organizationId, projectId, payload.workItemId),
    groupKey: `assignment:${payload.assignmentId}`,
    except: userActor(event),
    email: payload.role === 'responsible' || payload.role === 'reviewer',
    render: (projectName) => ({
      title: role.title,
      body: `${role.as} ${projectId ? inProject(projectName) : 'of the organization'}.`,
    }),
  };
}

/**
 * Work in a project moved to `in_review` (by a person, or by Ergon when its
 * agent's task succeeded), for whoever can decide on it; once per
 * submission. Work outside any project waits for Ergon to answer Kerykes
 * about it.
 */
function workReviewRequested(
  event: DomainEvent<Ergon['work-item.status-changed']>,
): NotificationPlan | null {
  const { organizationId, projectId, payload } = event;
  if (!organizationId || !projectId || payload.to !== 'in_review') {
    return null;
  }
  const workItemId = payload.workItem.id;
  return {
    type: 'work_review_requested',
    organizationId,
    projectId,
    taskId: null,
    audience: { kind: 'work-reviewers', workItemId, projectId },
    requires: { project: 'work:write' },
    link: workLink(organizationId, projectId, workItemId),
    groupKey: `work-review:${workItemId}:${event.aggregateVersion}`,
    except: userActor(event),
    email: true,
    render: (projectName) => ({
      title: 'Work is waiting for your review',
      body: `A work item ${inProject(projectName)} is ready for review. Approve it or ask for changes on its page.`,
    }),
  };
}
