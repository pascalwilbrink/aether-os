import { DomainError } from '@hephaestus/core';

import type { TaskAction, TaskStatus } from './task-transitions.js';

export class InvalidTaskTransitionError extends DomainError {
  constructor(taskId: string, status: TaskStatus, action: TaskAction) {
    super(
      `Task ${taskId} can't ${action} while ${status}.`,
      'TASK_INVALID_TRANSITION',
    );
  }
}

export class InvalidTaskDependencyError extends DomainError {
  constructor(message: string) {
    super(message, 'TASK_DEPENDENCY_INVALID');
  }
}

export class TaskParentFinishedError extends DomainError {
  constructor(parentTaskId: string) {
    super(
      `Task ${parentTaskId} has finished; it can't get new subtasks.`,
      'TASK_PARENT_FINISHED',
    );
  }
}

export class InvalidTaskCriteriaError extends DomainError {
  constructor(message: string) {
    super(message, 'TASK_CRITERIA_INVALID');
  }
}

/** A budget for a task tree is set on its top-level task. */
export class TaskBudgetInvalidError extends DomainError {
  constructor(
    reason = "A task tree's budget is set on its top-level task, not on a subtask.",
  ) {
    super(reason, 'TASK_BUDGET_INVALID');
  }
}

/** A concurrency key is set on a top-level task (docs/tasks.md, Concurrency). */
export class TaskConcurrencyInvalidError extends DomainError {
  constructor() {
    super(
      'A concurrency key is set on a top-level task, not on a subtask.',
      'TASK_CONCURRENCY_INVALID',
    );
  }
}

/** Policy `skip`: an unfinished task with the same key exists. */
export class TaskConcurrencySkippedError extends DomainError {
  constructor(
    readonly key: string,
    readonly activeTaskId: string,
  ) {
    super(
      `Task ${activeTaskId} with the concurrency key "${key}" hasn't finished; this one is skipped.`,
      'TASK_CONCURRENCY_SKIPPED',
    );
  }
}

/** A task's `context` names knowledge it can't pin (docs/tasks.md, `context`). */
export class TaskContextInvalidError extends DomainError {
  constructor(reason: string) {
    super(reason, 'TASK_CONTEXT_INVALID');
  }
}

/** A task's brief doesn't hold together (docs/tasks.md, Task fields). */
export class TaskFieldsInvalidError extends DomainError {
  constructor(reason: string) {
    super(reason, 'TASK_FIELDS_INVALID');
  }
}
