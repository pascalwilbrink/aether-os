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
