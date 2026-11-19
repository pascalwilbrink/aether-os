import { DomainError } from '@hephaestus/core';

/** Neither the organization nor (if allowed) the platform has a key. */
export class ModelKeyMissingError extends Error {
  constructor(readonly provider: string) {
    super(
      `No key for model provider ${provider}: set the organization's (or the agent's) ${provider} key`,
    );
    this.name = 'ModelKeyMissingError';
  }
}

/** Agent versions can only choose `active` models of the catalogue. */
export class ModelNotAvailableError extends DomainError {
  constructor(provider: string, model: string) {
    super(
      `Model ${provider}/${model} isn't an active model of the catalogue.`,
      'MODEL_NOT_AVAILABLE',
    );
  }
}

export class ModelAlreadyExistsError extends DomainError {
  constructor(provider: string, model: string) {
    super(
      `Model ${provider}/${model} is already in the catalogue.`,
      'MODEL_ALREADY_EXISTS',
    );
  }
}

/** A price must start after the model's latest one: past costs never move. */
export class ModelPriceInvalidError extends DomainError {
  constructor(modelId: string, latest: Date) {
    super(
      `A new price for model ${modelId} must start after ${latest.toISOString()}.`,
      'MODEL_PRICE_INVALID',
    );
  }
}

/** The gateway refuses to call a retired model. */
export class ModelRetiredError extends Error {
  constructor(
    readonly provider: string,
    readonly model: string,
  ) {
    super(
      `Model ${provider}/${model} is retired: choose another one in a new agent version`,
    );
    this.name = 'ModelRetiredError';
  }
}
