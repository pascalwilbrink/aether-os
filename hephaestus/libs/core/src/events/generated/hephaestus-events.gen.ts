// This file is generated from hephaestus.asyncapi.yaml by aether-asyncapi-types
// (@aether-os/contracts). Do not edit it by hand; run `pnpm generate:api`.

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
    | 'subtask_failed';
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
}

/** Every Hephaestus event type, mapped to its payload. */
export interface HephaestusEventPayloads {
  'task.cancelled': TaskCancelled;
  'task.created': TaskCreated;
  'task.failed': TaskFailed;
  'task.status-changed': TaskStatusChanged;
  'task.succeeded': TaskSucceeded;
}

export type HephaestusEventType = keyof HephaestusEventPayloads;

/** Every Hephaestus event type in the spec. */
export const HEPHAESTUS_EVENT_TYPES = [
  'task.cancelled',
  'task.created',
  'task.failed',
  'task.status-changed',
  'task.succeeded',
] as const satisfies readonly HephaestusEventType[];
