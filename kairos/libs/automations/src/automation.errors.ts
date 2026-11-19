import { DomainError } from '@kairos/core';

export class AutomationArchivedError extends DomainError {
  constructor(automationId: string) {
    super(
      `Automation ${automationId} is archived and can't be changed.`,
      'AUTOMATION_ARCHIVED',
    );
  }
}
