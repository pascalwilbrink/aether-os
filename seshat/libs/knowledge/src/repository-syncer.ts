import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { runWithLogContext } from '@seshat/core';

import type { RepositoryDocumentFile } from './knowledge-items.service.js';
import {
  KnowledgeRepositoriesService,
  type SyncResult,
} from './knowledge-repositories.service.js';
import type { KnowledgeRepositoryEntity } from './knowledge-repository.entity.js';
import {
  KNOWLEDGE_OPTIONS,
  type KnowledgeOptions,
} from './knowledge.options.js';
import {
  repositoryContentType,
  RepositoryFiles,
  RepositoryFilesError,
  underAnyPath,
} from './repository-files.js';

/**
 * Reads repositories waiting to be read (linked, pushed to, paths changed)
 * in the background: lists their files under their paths at the default
 * branch's head (Proxenos), keeps those Seshat can index (by type and
 * size, up to `REPOSITORY_MAX_DOCUMENTS`), and has their documents follow
 * (new, changed, gone); `DocumentIndexer` then reads each changed one.
 * Without Proxenos it doesn't run.
 */
@Injectable()
export class RepositorySyncer
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(RepositorySyncer.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(
    private readonly repositories: KnowledgeRepositoriesService,
    private readonly files: RepositoryFiles,
    @Inject(KNOWLEDGE_OPTIONS) private readonly options: KnowledgeOptions,
  ) {}

  onApplicationBootstrap(): void {
    if (this.options.repositorySyncIntervalMs > 0 && this.files.configured) {
      this.timer = setInterval(() => {
        this.running ??= this.drain()
          .then(() => undefined)
          .catch((error: unknown) =>
            this.logger.error(`Reading repositories failed: ${String(error)}`),
          )
          .finally(() => (this.running = undefined));
      }, this.options.repositorySyncIntervalMs);
      this.timer.unref();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  /** Reads waiting repositories until none is left; how many it handled. */
  async drain(): Promise<number> {
    if (!this.files.configured) {
      return 0;
    }
    let handled = 0;
    while (await this.syncOne()) {
      handled++;
    }
    return handled;
  }

  /** Reads one waiting repository; false when there was none. */
  async syncOne(): Promise<boolean> {
    const repository = await this.repositories.claim();
    if (!repository) {
      return false;
    }
    await runWithLogContext(
      {
        organizationId: repository.organizationId,
        projectId: repository.projectId,
      },
      async () => {
        const result = await this.read(repository);
        if (result.kind === 'failed') {
          this.logger.warn(
            `Repository link ${repository.linkId} couldn't be read: ${result.error}`,
          );
        }
        await this.repositories.finish(
          repository.linkId,
          repository.revision,
          result,
        );
      },
    );
    return true;
  }

  private async read(
    repository: KnowledgeRepositoryEntity,
  ): Promise<SyncResult> {
    let listing;
    try {
      listing = await this.files.list(
        repository.organizationId,
        repository.projectId,
        repository.linkId,
        repository.paths,
      );
    } catch (error) {
      if (error instanceof RepositoryFilesError) {
        return {
          kind: 'failed',
          error: error.message,
          retryable: error.retryable,
        };
      }
      return { kind: 'failed', error: String(error), retryable: true };
    }
    if (!listing) {
      return {
        kind: 'failed',
        error: "The repository isn't linked to the project (any more).",
        retryable: false,
      };
    }
    const wanted = listing.files.filter((file) =>
      underAnyPath(file.path, repository.paths),
    );
    const files: RepositoryDocumentFile[] = [];
    for (const file of wanted) {
      const contentType = repositoryContentType(file.path);
      if (
        !contentType ||
        file.sizeBytes > this.options.documentMaxBytes ||
        files.length >= this.options.repositoryMaxDocuments
      ) {
        continue;
      }
      files.push({
        path: file.path,
        blobSha: file.sha,
        sizeBytes: file.sizeBytes,
        url: file.url,
        contentType,
      });
    }
    const notes = [
      listing.truncated
        ? 'GitHub listed only part of the repository: some files may be missing.'
        : null,
      wanted.length - files.length > 0 &&
      files.length >= this.options.repositoryMaxDocuments
        ? `Only the first ${this.options.repositoryMaxDocuments} documents are indexed.`
        : null,
    ].filter((note): note is string => note !== null);
    return {
      kind: 'read',
      fullName: listing.fullName,
      commit: listing.commit,
      files,
      skippedCount: wanted.length - files.length,
      note: notes.length ? notes.join(' ') : null,
    };
  }
}
