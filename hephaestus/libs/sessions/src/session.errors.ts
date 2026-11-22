import { DomainError } from '@hephaestus/core';

/** One run at a time per session. */
export class SessionBusyError extends DomainError {
  constructor(sessionId: string) {
    super(
      `Session ${sessionId} is already running; wait for its run to finish.`,
      'SESSION_BUSY',
    );
  }
}

/** An ended session keeps its messages but runs no more. */
export class SessionEndedError extends DomainError {
  constructor(sessionId: string) {
    super(`Session ${sessionId} has ended.`, 'SESSION_ENDED');
  }
}
