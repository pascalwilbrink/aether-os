import { ServiceUnavailableException } from '@nestjs/common';

import { DomainError } from '@kairos/core';

export class AutomationArchivedError extends DomainError {
  constructor(automationId: string) {
    super(
      `Automation ${automationId} is archived and can't be changed.`,
      'AUTOMATION_ARCHIVED',
    );
  }
}

/** Ergon couldn't be reached or refused Kairos: the event is retried. */
export class ErgonUnavailableError extends ServiceUnavailableException {
  constructor(reason: string) {
    super(`Ergon is unavailable: ${reason}`);
  }
}
