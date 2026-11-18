import type { ApiTypes } from '@hephaestus/core';

export type TaskStatus = ApiTypes.TaskStatus;
export type TaskFailureReason = ApiTypes.TaskFailureReason;

/**
 * What can happen to a task (docs/tasks.md, Task lifecycle). The runner
 * (later) drives most of these; people cancel and retry.
 */
export type TaskAction =
  | 'dependencies-met'
  | 'provision'
  | 'run'
  | 'verify'
  | 'await-review'
  | 'wait-for-subtasks'
  | 'deliver'
  | 'pause'
  | 'resume'
  | 'succeed'
  | 'fail'
  | 'cancel'
  | 'retry';

export const TERMINAL: readonly TaskStatus[] = [
  'succeeded',
  'failed',
  'cancelled',
];

const ACTIVE: readonly TaskStatus[] = [
  'blocked',
  'queued',
  'provisioning',
  'running',
  'verifying',
  'awaiting_review',
  'waiting',
  'paused',
  'delivering',
];

/** Every allowed (action, from) → to; anything else is invalid. */
const TRANSITIONS: Record<
  TaskAction,
  Partial<Record<TaskStatus, TaskStatus>>
> = {
  'dependencies-met': { blocked: 'queued' },
  provision: { queued: 'provisioning' },
  run: {
    provisioning: 'running',
    // A failed check, or a reviewer requesting changes.
    verifying: 'running',
    awaiting_review: 'running',
    // A subtask failed back to its parent's agent.
    waiting: 'running',
  },
  verify: { running: 'verifying' },
  'await-review': { verifying: 'awaiting_review' },
  // A planning task whose task_plan created subtasks.
  'wait-for-subtasks': { verifying: 'waiting', awaiting_review: 'waiting' },
  deliver: {
    verifying: 'delivering',
    awaiting_review: 'delivering',
    waiting: 'delivering',
  },
  pause: { provisioning: 'paused', running: 'paused', verifying: 'paused' },
  resume: { paused: 'queued' },
  succeed: { delivering: 'succeeded' },
  fail: Object.fromEntries(ACTIVE.map((status) => [status, 'failed'])),
  // Idempotent for a cancelled task; succeeded and failed are final.
  cancel: {
    ...Object.fromEntries(ACTIVE.map((status) => [status, 'cancelled'])),
    cancelled: 'cancelled',
  },
  // The service decides between queued and blocked (dependencies).
  retry: { failed: 'queued' },
};

/** The next status, or null if the action isn't allowed from `current`. */
export function nextTaskStatus(
  current: TaskStatus,
  action: TaskAction,
): TaskStatus | null {
  return TRANSITIONS[action][current] ?? null;
}

export function isTerminal(status: TaskStatus): boolean {
  return TERMINAL.includes(status);
}
