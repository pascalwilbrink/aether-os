import { DomainError } from '@agora/core';

import type { CouncilVersionStatus } from './council-transitions.js';

export class CouncilAlreadyExistsError extends DomainError {
  constructor(key: string) {
    super(
      `The organization already has a council ${key}.`,
      'COUNCIL_ALREADY_EXISTS',
    );
  }
}

export class CouncilArchivedError extends DomainError {
  constructor(councilId: string) {
    super(`Council ${councilId} is archived.`, 'COUNCIL_ARCHIVED');
  }
}

export class CouncilVersionConflictError extends DomainError {
  constructor(councilId: string, version: number) {
    super(
      `Version ${version} already exists for council ${councilId}.`,
      'COUNCIL_VERSION_CONFLICT',
    );
  }
}

export class CouncilVersionInvalidError extends DomainError {
  constructor(reason: string) {
    super(reason, 'COUNCIL_VERSION_INVALID');
  }
}

export class InvalidCouncilVersionTransitionError extends DomainError {
  constructor(
    versionId: string,
    from: CouncilVersionStatus,
    to: CouncilVersionStatus,
  ) {
    super(
      `Council version ${versionId} can't move from ${from} to ${to}.`,
      'COUNCIL_VERSION_INVALID_TRANSITION',
    );
  }
}
