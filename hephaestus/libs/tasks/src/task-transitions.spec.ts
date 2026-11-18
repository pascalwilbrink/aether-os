import {
  isTerminal,
  nextTaskStatus,
  type TaskAction,
  type TaskStatus,
} from './task-transitions.js';

const STATUSES: TaskStatus[] = [
  'blocked',
  'queued',
  'provisioning',
  'running',
  'verifying',
  'awaiting_review',
  'waiting',
  'paused',
  'delivering',
  'succeeded',
  'failed',
  'cancelled',
];

/** Every allowed transition; every other (status, action) pair is refused. */
const ALLOWED: [TaskStatus, TaskAction, TaskStatus][] = [
  ['blocked', 'dependencies-met', 'queued'],
  ['queued', 'provision', 'provisioning'],
  ['provisioning', 'run', 'running'],
  ['verifying', 'run', 'running'],
  ['awaiting_review', 'run', 'running'],
  ['waiting', 'run', 'running'],
  ['running', 'verify', 'verifying'],
  ['verifying', 'await-review', 'awaiting_review'],
  ['verifying', 'wait-for-subtasks', 'waiting'],
  ['awaiting_review', 'wait-for-subtasks', 'waiting'],
  ['verifying', 'deliver', 'delivering'],
  ['awaiting_review', 'deliver', 'delivering'],
  ['waiting', 'deliver', 'delivering'],
  ['provisioning', 'pause', 'paused'],
  ['running', 'pause', 'paused'],
  ['verifying', 'pause', 'paused'],
  ['paused', 'resume', 'queued'],
  ['provisioning', 'requeue', 'queued'],
  ['running', 'requeue', 'queued'],
  ['verifying', 'requeue', 'queued'],
  ['delivering', 'succeed', 'succeeded'],
  ['failed', 'retry', 'queued'],
  ['cancelled', 'cancel', 'cancelled'],
  ...STATUSES.filter((s) => !isTerminal(s)).flatMap(
    (s): [TaskStatus, TaskAction, TaskStatus][] => [
      [s, 'fail', 'failed'],
      [s, 'cancel', 'cancelled'],
    ],
  ),
];

const ACTIONS: TaskAction[] = [
  'dependencies-met',
  'provision',
  'run',
  'verify',
  'await-review',
  'wait-for-subtasks',
  'deliver',
  'pause',
  'resume',
  'requeue',
  'succeed',
  'fail',
  'cancel',
  'retry',
];

describe('task transitions', () => {
  it.each(
    STATUSES.flatMap((status) =>
      ACTIONS.map((action) => [status, action] as const),
    ),
  )('%s + %s', (status, action) => {
    const allowed = ALLOWED.find(
      ([from, a]) => from === status && a === action,
    );
    expect(nextTaskStatus(status, action)).toBe(allowed ? allowed[2] : null);
  });

  it('knows the terminal states', () => {
    expect(STATUSES.filter(isTerminal)).toEqual([
      'succeeded',
      'failed',
      'cancelled',
    ]);
  });
});
