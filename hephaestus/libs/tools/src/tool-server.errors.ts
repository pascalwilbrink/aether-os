import { DomainError } from '@hephaestus/core';

export class ToolServerAlreadyExistsError extends DomainError {
  constructor(name: string) {
    super(
      `The organization already has a tool server named ${name}.`,
      'TOOL_SERVER_ALREADY_EXISTS',
    );
  }
}

/** A URL or authentication Hephaestus won't use (see `checkToolServer`). */
export class ToolServerInvalidError extends DomainError {
  constructor(reason: string) {
    super(reason, 'TOOL_SERVER_INVALID');
  }
}

/**
 * Connecting to a tool server for a run failed. `retryable` tells a
 * configuration problem (no such server, no credential, a tool it doesn't
 * offer: retrying won't help) from the server being down.
 */
export class ToolServerUnavailableError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ToolServerUnavailableError';
  }
}
