import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { runWithLogContext } from '@seshat/core';

import { Embeddings, EmbeddingsError } from './embeddings.js';
import { KnowledgeChunksService } from './knowledge-chunks.service.js';
import {
  type EmbeddingResult,
  KnowledgeItemsService,
} from './knowledge-items.service.js';
import {
  KNOWLEDGE_OPTIONS,
  type KnowledgeOptions,
} from './knowledge.options.js';

/** Passages per call to Pylon. */
const BATCH = 64;

/**
 * Embeds passages in the background (../../../../docs/knowledge.md, step
 * 2): claims an item whose passages wait for vectors, embeds them through
 * Pylon (`Embeddings`) and stores the vectors (`finishEmbedding`). A
 * failure is tried again with backoff (`finishEmbedding`); until then the
 * item is found by its keywords only. Off without Pylon.
 */
@Injectable()
export class KnowledgeEmbedder
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(KnowledgeEmbedder.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(
    private readonly items: KnowledgeItemsService,
    private readonly chunks: KnowledgeChunksService,
    private readonly embeddings: Embeddings,
    @Inject(KNOWLEDGE_OPTIONS) private readonly options: KnowledgeOptions,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const model = this.embeddings.model;
    if (!model) {
      return;
    }
    // A new model: everything is embedded again, vectors of one model at a time.
    const requeued = await this.items.requeueEmbeddingsNotFrom(model);
    if (requeued > 0) {
      this.logger.log(`${requeued} items wait to be embedded with ${model}`);
    }
    if (this.options.embedderIntervalMs > 0) {
      this.timer = setInterval(() => {
        this.running ??= this.drain()
          .then(() => undefined)
          .catch((error: unknown) =>
            this.logger.error(`Embedding failed: ${String(error)}`),
          )
          .finally(() => (this.running = undefined));
      }, this.options.embedderIntervalMs);
      this.timer.unref();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  /** Embeds waiting items until none is left; how many it handled. */
  async drain(): Promise<number> {
    let handled = 0;
    while (await this.embedOne()) {
      handled++;
    }
    return handled;
  }

  /** Embeds one waiting item's passages; false when there was none. */
  async embedOne(): Promise<boolean> {
    const model = this.embeddings.model;
    if (!model) {
      return false;
    }
    const item = await this.items.claimForEmbedding();
    if (!item) {
      return false;
    }
    const { projectId } = item;
    if (projectId === null) {
      // Claimed for a project only; a department's item never gets here.
      return true;
    }
    await runWithLogContext(
      { organizationId: item.organizationId, projectId },
      async () => {
        const result = await this.embed(
          {
            id: item.id,
            organizationId: item.organizationId,
            projectId,
            version: item.version,
          },
          model,
        );
        if (result.kind === 'failed') {
          this.logger.warn(
            `Item ${item.id} (version ${item.version}) couldn't be embedded: ${result.error}`,
          );
        }
        await this.items.finishEmbedding(item.id, item.version, result);
      },
    );
    return true;
  }

  private async embed(
    item: {
      id: string;
      organizationId: string;
      projectId: string;
      version: number;
    },
    model: string,
  ): Promise<EmbeddingResult> {
    const passages = await this.chunks.passagesOf(item.id, item.version);
    const vectors: { chunkId: string; vector: number[] }[] = [];
    try {
      for (let i = 0; i < passages.length; i += BATCH) {
        const batch = passages.slice(i, i + BATCH);
        const embedded = await this.embeddings.embed(
          item.organizationId,
          item.projectId,
          batch.map((passage) => passage.text),
        );
        batch.forEach((passage, index) =>
          vectors.push({ chunkId: passage.id, vector: embedded[index] }),
        );
      }
    } catch (error) {
      return error instanceof EmbeddingsError
        ? { kind: 'failed', error: error.message, retryable: error.retryable }
        : { kind: 'failed', error: String(error), retryable: true };
    }
    return { kind: 'embedded', model, vectors };
  }
}
