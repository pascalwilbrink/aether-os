import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { runWithLogContext } from '@seshat/core';

import { DocumentFileError, DocumentFiles } from './document-files.js';
import { extractText } from './document-text.js';
import {
  type IndexingResult,
  KnowledgeItemsService,
} from './knowledge-items.service.js';
import {
  KNOWLEDGE_OPTIONS,
  type KnowledgeOptions,
} from './knowledge.options.js';

/**
 * Indexes documents in the background: claims a pending one, reads its
 * file from Loculus, extracts its text (`extractText`) and stores it as
 * searchable passages (`finishIndexing`). A failure that may pass is tried
 * again with backoff, up to five times; one that won't fails it.
 */
@Injectable()
export class DocumentIndexer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(DocumentIndexer.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(
    private readonly items: KnowledgeItemsService,
    private readonly files: DocumentFiles,
    @Inject(KNOWLEDGE_OPTIONS) private readonly options: KnowledgeOptions,
  ) {}

  onApplicationBootstrap(): void {
    if (this.options.indexerIntervalMs > 0) {
      this.timer = setInterval(() => {
        this.running ??= this.drain()
          .then(() => undefined)
          .catch((error: unknown) =>
            this.logger.error(`Indexing failed: ${String(error)}`),
          )
          .finally(() => (this.running = undefined));
      }, this.options.indexerIntervalMs);
      this.timer.unref();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  /** Indexes waiting documents until none is left; how many it handled. */
  async drain(): Promise<number> {
    let handled = 0;
    while (await this.indexOne()) {
      handled++;
    }
    return handled;
  }

  /** Indexes one waiting document; false when there was none. */
  async indexOne(): Promise<boolean> {
    const item = await this.items.claimDocument();
    if (!item?.fileId || !item.sha256 || item.sizeBytes === null) {
      return item !== null;
    }
    await runWithLogContext(
      { organizationId: item.organizationId, projectId: item.projectId },
      async () => {
        const result = await this.index(item);
        if (result.kind === 'failed') {
          this.logger.warn(
            `Document ${item.id} (version ${item.version}) couldn't be indexed: ${result.error}`,
          );
        }
        await this.items.finishIndexing(item.id, item.version, result);
      },
    );
    return true;
  }

  private async index(item: {
    organizationId: string;
    projectId: string;
    fileId: string | null;
    sha256: string | null;
    sizeBytes: number | null;
    contentType: string | null;
    fileName: string | null;
  }): Promise<IndexingResult> {
    try {
      const bytes = await this.files.read(item.organizationId, item.projectId, {
        id: item.fileId!,
        sha256: item.sha256!,
        sizeBytes: item.sizeBytes!,
      });
      const extracted = await extractText(
        bytes,
        item.contentType ?? '',
        item.fileName ?? '',
      );
      // A file that can't be read won't read better next time.
      return extracted.kind === 'unreadable'
        ? { kind: 'failed', error: extracted.reason, retryable: false }
        : extracted;
    } catch (error) {
      if (error instanceof DocumentFileError) {
        return {
          kind: 'failed',
          error: error.message,
          retryable: error.retryable,
        };
      }
      return { kind: 'failed', error: String(error), retryable: true };
    }
  }
}
