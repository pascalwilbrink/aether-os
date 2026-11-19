// This file is generated from hephaestus.asyncapi.yaml by aether-asyncapi-types
// (@aether-os/contracts). Do not edit it by hand; run `pnpm generate:api`.

/**
 * Payload of `artifact.created`.
 */
export interface ArtifactCreated {
  artifactId: string;
  taskId: string;
  executionId: string;
  /**
   * An open set: `text`, `json`, `verification`, `pull_request` so far.
   */
  kind: string;
  status:
    | 'pending'
    | 'draft'
    | 'final'
    | 'rejected'
    | 'changes_requested'
    | 'partial';
  primary: boolean;
}

/**
 * Payload of `artifact.status-changed`.
 */
export interface ArtifactStatusChanged {
  artifactId: string;
  taskId: string;
  from:
    | 'pending'
    | 'draft'
    | 'final'
    | 'rejected'
    | 'changes_requested'
    | 'partial';
  to:
    | 'pending'
    | 'draft'
    | 'final'
    | 'rejected'
    | 'changes_requested'
    | 'partial';
  revisionOf: string | null;
}

/**
 * Payload of `budget.threshold-reached`.
 */
export interface BudgetThresholdReached {
  budgetId: string;
  scope: 'organization' | 'project' | 'agent' | 'task_tree';
  scopeId: string;
  /**
   * US dollars
   */
  limitUsd: string;
  /**
   * US dollars
   */
  spentUsd: string;
  /**
   * The month it's for; null for a task tree's (its lifetime).
   */
  windowStart: string | null;
}

/**
 * Payload of `task.awaiting-review`.
 */
export interface TaskAwaitingReview {
  taskId: string;
  topLevelTaskId: string;
  requestedBy: string;
  draftArtifactIds: string[];
  /**
   * 1 for the first review, plus one per revision.
   */
  round: number;
}

/**
 * Payload of `task.cancelled`.
 */
export interface TaskCancelled {
  taskId: string;
  topLevelTaskId: string;
  /**
   * The `sub` of whoever cancelled it (the task itself or an ancestor); null when the system did.
   */
  cancelledBy: string | null;
}

/**
 * Payload of `task.created`.
 */
export interface TaskCreated {
  taskId: string;
  parentTaskId: string | null;
  topLevelTaskId: string;
  agentId: string;
  agentVersionId: string;
  serviceAccountId: string;
  requestedBy: string;
  idempotencyKey: string;
  status:
    | 'blocked'
    | 'queued'
    | 'provisioning'
    | 'running'
    | 'verifying'
    | 'awaiting_review'
    | 'waiting'
    | 'paused'
    | 'delivering'
    | 'succeeded'
    | 'failed'
    | 'cancelled';
  taskTemplateId: string | null;
  taskTemplateVersion: number | null;
}

/**
 * Payload of `task.failed`.
 */
export interface TaskFailed {
  taskId: string;
  topLevelTaskId: string;
  requestedBy: string;
  failureReason:
    | 'agent_failed'
    | 'verification_failed'
    | 'rejected'
    | 'timeout'
    | 'budget_exceeded'
    | 'infrastructure'
    | 'subtask_failed'
    | 'access_denied';
}

/**
 * Payload of `task.paused`.
 */
export interface TaskPaused {
  taskId: string;
  topLevelTaskId: string;
  requestedBy: string;
  scope: 'organization' | 'project' | 'agent' | 'task_tree';
}

/**
 * Payload of `task.resumed`.
 */
export interface TaskResumed {
  taskId: string;
  topLevelTaskId: string;
}

/**
 * Payload of `task.status-changed`.
 */
export interface TaskStatusChanged {
  taskId: string;
  from:
    | 'blocked'
    | 'queued'
    | 'provisioning'
    | 'running'
    | 'verifying'
    | 'awaiting_review'
    | 'waiting'
    | 'paused'
    | 'delivering'
    | 'succeeded'
    | 'failed'
    | 'cancelled';
  to:
    | 'blocked'
    | 'queued'
    | 'provisioning'
    | 'running'
    | 'verifying'
    | 'awaiting_review'
    | 'waiting'
    | 'paused'
    | 'delivering'
    | 'succeeded'
    | 'failed'
    | 'cancelled';
  /**
   * Why, when there is one (a failure reason, `retry`, `cancelled-with-parent`, `dependencies-met`).
   */
  reason: string | null;
}

/**
 * Payload of `task.succeeded`.
 */
export interface TaskSucceeded {
  taskId: string;
  topLevelTaskId: string;
  requestedBy: string;
  primaryArtifactId: string;
  /**
   * Every `final` artifact of the task, the primary one included.
   */
  artifactIds: string[];
}

/**
 * Payload of `task.verified`.
 */
export interface TaskVerified {
  taskId: string;
  executionId: string;
  agentVersionId: string;
  round: number;
  /**
   * No criterion failed (manual ones are left to the reviewer).
   */
  passed: boolean;
  results: {
    key: string;
    outcome: 'passed' | 'failed' | 'manual';
  }[];
}

/** Every Hephaestus event type, mapped to its payload. */
export interface HephaestusEventPayloads {
  'artifact.created': ArtifactCreated;
  'artifact.status-changed': ArtifactStatusChanged;
  'budget.threshold-reached': BudgetThresholdReached;
  'task.awaiting-review': TaskAwaitingReview;
  'task.cancelled': TaskCancelled;
  'task.created': TaskCreated;
  'task.failed': TaskFailed;
  'task.paused': TaskPaused;
  'task.resumed': TaskResumed;
  'task.status-changed': TaskStatusChanged;
  'task.succeeded': TaskSucceeded;
  'task.verified': TaskVerified;
}

export type HephaestusEventType = keyof HephaestusEventPayloads;

/** Every Hephaestus event type in the spec. */
export const HEPHAESTUS_EVENT_TYPES = [
  'artifact.created',
  'artifact.status-changed',
  'budget.threshold-reached',
  'task.awaiting-review',
  'task.cancelled',
  'task.created',
  'task.failed',
  'task.paused',
  'task.resumed',
  'task.status-changed',
  'task.succeeded',
  'task.verified',
] as const satisfies readonly HephaestusEventType[];
