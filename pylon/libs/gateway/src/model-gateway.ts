import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

import {
  type CatalogEntry,
  isSelfHosted,
  ModelCatalogService,
  ModelEndpointUnavailableError,
  ModelNotAvailableError,
  ModelRetiredError,
  type ModelKind,
} from '@pylon/catalog';
import { ProblemException, SecretStoreUnavailableError } from '@pylon/core';
import { ProviderKeys, type ProviderKey } from '@pylon/keys';
import {
  BudgetsService,
  type CallContext,
  ModelCallsService,
} from '@pylon/usage';

import type { MeteredUsage } from './usage-meters.js';

/** A call Pylon agreed to make: its key, and the price to record it at. */
export interface PreparedCall {
  kind: ModelKind;
  provider: string;
  model: string;
  key: ProviderKey;
  price: CatalogEntry['price'];
}

/** The provider didn't answer, or its server isn't one Pylon will call (502). */
export function providerUnavailable(message: string): ProblemException {
  return new ProblemException(502, 'PROVIDER_UNAVAILABLE', message);
}

/**
 * The checks before every call and the metering after it (docs/pylon.md,
 * Model calls): the model (in the catalogue and not retired, of the right
 * kind; an organization's own server's models aren't in it), the budgets
 * (`402 BUDGET_EXHAUSTED`, naming the narrowest that ran out), the key;
 * then the call is recorded, priced at the catalogue's price when it was
 * made, and the budgets' thresholds checked.
 */
@Injectable()
export class ModelGateway {
  private readonly logger = new Logger(ModelGateway.name);

  constructor(
    private readonly catalog: ModelCatalogService,
    private readonly budgets: BudgetsService,
    private readonly calls: ModelCallsService,
    private readonly keys: ProviderKeys,
  ) {}

  async prepare(
    context: CallContext,
    kind: ModelKind,
    provider: string,
    model: string,
  ): Promise<PreparedCall> {
    const entry = isSelfHosted(provider)
      ? null
      : await this.catalog.entryFor(provider, model, new Date());
    if (entry?.status === 'retired') {
      throw new ModelRetiredError(provider, model);
    }
    // Embeddings only with the catalogue's embedding models; a chat model
    // outside the catalogue (from before it) is called unpriced.
    if (
      entry
        ? entry.kind !== kind
        : kind === 'embedding' && !isSelfHosted(provider)
    ) {
      throw new ModelNotAvailableError(provider, model);
    }
    const exhausted = await this.budgets.exhausted(context);
    if (exhausted) {
      throw new ProblemException(
        402,
        'BUDGET_EXHAUSTED',
        `The ${exhausted.scope.replace('_', ' ')} budget ran out.`,
        { budget: exhausted },
      );
    }
    let key: ProviderKey;
    try {
      key = await this.keys.keyFor(
        context.organizationId,
        provider,
        context.agentId,
      );
    } catch (error) {
      if (error instanceof SecretStoreUnavailableError) {
        this.logger.warn(`No key read: ${error.message}`);
        throw new ServiceUnavailableException(
          "Provider keys can't be read right now (OpenBao).",
        );
      }
      if (error instanceof ModelEndpointUnavailableError) {
        throw providerUnavailable(error.message);
      }
      throw error;
    }
    return { kind, provider, model, key, price: entry?.price ?? null };
  }

  /**
   * Records a call that reached the provider, and checks the budgets'
   * thresholds. Never throws: the answer has gone to the caller already.
   */
  async finish(
    context: CallContext,
    call: PreparedCall,
    usage: MeteredUsage,
  ): Promise<{ costUsd: string | null }> {
    try {
      const recorded = await this.calls.record(context, {
        kind: call.kind,
        provider: call.provider,
        model: call.model,
        keySource: call.key.source,
        price: call.price,
        tokens: usage.tokens,
        finishReason: usage.finishReason,
      });
      await this.budgets.afterCall(context);
      return recorded;
    } catch (error) {
      this.logger.error(
        `Recording a ${call.provider}/${call.model} call failed`,
        error instanceof Error ? error.stack : String(error),
      );
      return { costUsd: null };
    }
  }
}
