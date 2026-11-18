import { DomainError } from '@hephaestus/core';

export class TaskTemplateInvalidError extends DomainError {
  constructor(message: string) {
    super(message, 'TASK_TEMPLATE_INVALID');
  }
}

export class TaskTemplateArchivedError extends DomainError {
  constructor(templateId: string) {
    super(
      `Task template ${templateId} is archived: no new tasks from it.`,
      'TASK_TEMPLATE_ARCHIVED',
    );
  }
}

export class TaskTemplateInputsInvalidError extends DomainError {
  constructor(message: string) {
    super(message, 'TASK_TEMPLATE_INPUTS_INVALID');
  }
}
