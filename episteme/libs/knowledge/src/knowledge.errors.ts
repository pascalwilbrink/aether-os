import { DomainError, type ApiTypes } from '@episteme/core';

type Code = ApiTypes.DomainErrorCode;

/** A business rule of Episteme's (409, with its code). */
export class KnowledgeError extends DomainError {
  constructor(message: string, code: Code) {
    super(message, code);
  }
}

export const invalidTransition = (what: string, state: string) =>
  new KnowledgeError(
    `${what} isn't possible while it's ${state}.`,
    'INVALID_TRANSITION',
  );

export const draftExists = () =>
  new KnowledgeError(
    'The resource already has a version in draft or in review: edit or decide that one.',
    'DRAFT_EXISTS',
  );

export const notADraft = () =>
  new KnowledgeError('Only a draft can be edited.', 'NOT_A_DRAFT');

export const notInReview = () =>
  new KnowledgeError('The version has no open review.', 'NOT_IN_REVIEW');

export const notApproved = () =>
  new KnowledgeError(
    'Only an approved version can be published.',
    'NOT_APPROVED',
  );

export const resourceArchived = () =>
  new KnowledgeError(
    'The resource is archived and can no longer change.',
    'RESOURCE_ARCHIVED',
  );

export const resourcePublished = () =>
  new KnowledgeError(
    'The resource was published, so it is kept: archive it instead.',
    'RESOURCE_PUBLISHED',
  );

export const ownerRequired = () =>
  new KnowledgeError('A resource needs at least one owner.', 'OWNER_REQUIRED');

export const unknownPersons = (ids: readonly string[]) =>
  new KnowledgeError(
    `Not active persons of the organization: ${ids.join(', ')}.`,
    'UNKNOWN_PERSON',
  );

export const unknownVersion = (id: string) =>
  new KnowledgeError(
    `Version ${id} isn't a version of this resource.`,
    'UNKNOWN_VERSION',
  );
