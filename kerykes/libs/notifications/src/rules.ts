import type {
  DomainEvent,
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

/** Who a notification is for, before the permission check. */
export type Audience =
  /** One user: a task's requester, or someone just added. */
  | { kind: 'user'; sub: string }
  /** The project's approvers (organization admins when it has none). */
  | { kind: 'approvers'; projectId: string }
  /** The organization's owners and admins. */
  | { kind: 'organization-admins' };

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
