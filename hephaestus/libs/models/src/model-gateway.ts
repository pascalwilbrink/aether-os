import { Injectable } from '@nestjs/common';
import type { MastraModelConfig } from '@mastra/core/llm';

import type { AgentVersion } from '@hephaestus/core';

import { PylonModels } from './pylon-models.js';

/** Who a model call is for: Pylon attributes it from the task token. */
export interface ModelCallContext {
  organizationId: string;
  projectId: string;
  taskId: string;
  /** The task tree it's part of (budgets: docs/models.md). */
  topLevelTaskId: string;
  agentId: string;
  executionId: string;
  agentVersionId: string;
}

export interface ResolvedModel {
  /** What Mastra calls: the provider's own API, through Pylon. */
  model: MastraModelConfig;
  provider: string;
  modelId: string;
}

/**
 * Turns an agent version's model into something Mastra can call, through
 * Pylon (../docs/pylon.md): the provider's own AI SDK client, pointed at
 * Pylon's pass-through, with the task token as its key. Pylon checks the
 * catalogue and the budgets, picks the provider key and meters the call;
 * Hephaestus never sees a key.
 */
@Injectable()
export class ModelGateway {
  constructor(private readonly pylon: PylonModels) {}

  resolve(
    context: ModelCallContext,
    configuration: AgentVersion['model'],
    taskToken: string,
  ): ResolvedModel {
    const { provider, model: modelId } = configuration;
    return {
      model: this.pylon.create(provider, modelId, {
        token: taskToken,
        executionId: context.executionId,
      }),
      provider,
      modelId,
    };
  }
}
