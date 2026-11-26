import { DomainError } from '@ergon/core';

export class InvalidTransitionError extends DomainError {
  constructor(status: string, action: string) {
    super(
      `A work item that is ${status} can't be moved with ${action}.`,
      'INVALID_TRANSITION',
    );
  }
}

export class ReviewRequiredError extends DomainError {
  constructor(workItemId: string) {
    super(
      `Work item ${workItemId} needs review: submit it, then approve it.`,
      'REVIEW_REQUIRED',
    );
  }
}

export class ChildrenOpenError extends DomainError {
  constructor(workItemId: string) {
    super(
      `Work item ${workItemId} has children that are neither done nor cancelled.`,
      'CHILDREN_OPEN',
    );
  }
}

export class WorkItemClosedError extends DomainError {
  constructor(workItemId: string, status: string) {
    super(
      `Work item ${workItemId} is ${status} and can't be changed this way.`,
      'WORK_ITEM_CLOSED',
    );
  }
}

export class AlreadyAssignedError extends DomainError {
  constructor(role: string) {
    super(
      `The assignee already has the ${role} role here.`,
      'ALREADY_ASSIGNED',
    );
  }
}

export class SelfDependencyError extends DomainError {
  constructor() {
    super("A work item can't depend on itself.", 'SELF_DEPENDENCY');
  }
}

export class DependencyExistsError extends DomainError {
  constructor() {
    super('That dependency already exists.', 'DEPENDENCY_EXISTS');
  }
}

export class DependencyCycleError extends DomainError {
  constructor() {
    super(
      'That dependency would make the work wait for itself.',
      'DEPENDENCY_CYCLE',
    );
  }
}

export class DependencyLimitError extends DomainError {
  constructor(workItemId: string, limit: number) {
    super(
      `Work item ${workItemId} already has ${limit} dependencies.`,
      'DEPENDENCY_LIMIT',
    );
  }
}
