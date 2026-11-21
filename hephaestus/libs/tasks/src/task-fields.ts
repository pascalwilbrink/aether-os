import type { ApiTypes } from '@hephaestus/core';

import {
  InvalidTaskCriteriaError,
  TaskFieldsInvalidError,
} from './task.errors.js';

export type TaskItem = ApiTypes.TaskItem;
export type TaskDeliverable = ApiTypes.TaskDeliverable;

/** The fields of a new task's brief (docs/tasks.md, Task fields), as stored. */
export interface TaskBrief {
  description: string;
  requirements: TaskItem[];
  expectedOutcome: string | null;
  constraints: TaskItem[];
  deliverables: TaskDeliverable[];
  /** The criteria its deliverables imply (`source: deliverable`). */
  deliverableCriteria: ApiTypes.AcceptanceCriterion[];
  /** Text from outside, named `{{name}}` in the text fields. */
  untrustedInputs: ApiTypes.UntrustedInput[];
}

/** The key of the criterion a deliverable implies. */
export const deliverableCriterionKey = (key: string) => `deliverable.${key}`;

/**
 * A new task's brief from its request, checked: `description` (or its old
 * name `instructions`), keys unique among requirements and constraints and
 * among deliverables, at most one primary deliverable, a `path` only on a
 * `file` one, a `pull_request` one only for a task with a repository, and
 * every criterion's `requirementKey` one of its requirements or
 * constraints. Each deliverable implies an `artifact` criterion.
 */
export function taskBriefOf(
  dto: Pick<
    ApiTypes.CreateTaskRequest,
    | 'description'
    | 'instructions'
    | 'requirements'
    | 'expectedOutcome'
    | 'constraints'
    | 'deliverables'
    | 'untrustedInputs'
  >,
  criteria: readonly ApiTypes.AcceptanceCriterionRequest[],
  hasRepository: boolean,
): TaskBrief {
  const description = dto.description ?? dto.instructions;
  if (!description?.trim()) {
    throw new TaskFieldsInvalidError(
      'A task needs a description: what needs to be done, and why.',
    );
  }
  const requirements = dto.requirements ?? [];
  const constraints = dto.constraints ?? [];
  const itemKeys = [...requirements, ...constraints].map((item) => item.key);
  const duplicate = firstDuplicate(itemKeys);
  if (duplicate) {
    throw new TaskFieldsInvalidError(
      `The key ${duplicate} is used twice among the requirements and constraints.`,
    );
  }

  const deliverables = dto.deliverables ?? [];
  const duplicateDeliverable = firstDuplicate(deliverables.map((d) => d.key));
  if (duplicateDeliverable) {
    throw new TaskFieldsInvalidError(
      `The deliverable ${duplicateDeliverable} is listed twice.`,
    );
  }
  if (deliverables.filter((d) => d.primary).length > 1) {
    throw new TaskFieldsInvalidError(
      'At most one deliverable is the primary one.',
    );
  }
  for (const deliverable of deliverables) {
    if (deliverable.path !== undefined && deliverable.kind !== 'file') {
      throw new TaskFieldsInvalidError(
        `The deliverable ${deliverable.key} has a path, but only a file deliverable takes one.`,
      );
    }
    if (deliverable.kind === 'pull_request' && !hasRepository) {
      throw new TaskFieldsInvalidError(
        `The deliverable ${deliverable.key} is a pull request, but the task works in no repository.`,
      );
    }
  }

  const untrustedInputs = dto.untrustedInputs ?? [];
  const duplicateInput = firstDuplicate(untrustedInputs.map((i) => i.name));
  if (duplicateInput) {
    throw new TaskFieldsInvalidError(
      `The untrusted input ${duplicateInput} is given twice.`,
    );
  }

  const known = new Set(itemKeys);
  for (const criterion of criteria) {
    if (criterion.requirementKey && !known.has(criterion.requirementKey)) {
      throw new InvalidTaskCriteriaError(
        `The criterion ${criterion.key} checks ${criterion.requirementKey}, which isn't one of the task's requirements or constraints.`,
      );
    }
  }

  return {
    description,
    requirements,
    expectedOutcome: dto.expectedOutcome?.trim() ? dto.expectedOutcome : null,
    constraints,
    deliverables,
    untrustedInputs,
    deliverableCriteria: deliverables.map((deliverable) => ({
      key: deliverableCriterionKey(deliverable.key),
      description: `Deliverable ${deliverable.key}: ${deliverable.description}`,
      check: { type: 'artifact' as const, deliverable: deliverable.key },
      source: 'deliverable' as const,
    })),
  };
}

/** Whether a file name matches a deliverable's `path` (`*` for any characters). */
export function matchesPath(fileName: string, path: string): boolean {
  const pattern = path
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${pattern}$`).test(fileName);
}

function firstDuplicate(values: string[]): string | undefined {
  return values.find((value, i) => values.indexOf(value) !== i);
}
