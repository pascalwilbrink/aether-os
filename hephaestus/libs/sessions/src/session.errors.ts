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

/** A mode the session can't be in (an agent session, or one its council doesn't allow). */
export class SessionModeInvalidError extends DomainError {
  constructor(reason: string) {
    super(reason, 'SESSION_MODE_INVALID');
  }
}

/** Addressing a member directly that the session can't address. */
export class SessionMemberInvalidError extends DomainError {
  constructor(reason: string) {
    super(reason, 'SESSION_MEMBER_INVALID');
  }
}
