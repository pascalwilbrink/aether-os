import { randomBytes } from 'node:crypto';

import {
  DocumentFileError,
  gitBlobSha,
  RepositoryFiles,
  RepositoryFilesError,
  type RepositoryListing,
} from '@seshat/knowledge';

interface FakeRepository {
  organizationId: string;
  projectId: string;
  fullName: string;
  commit: string;
  files: Map<string, Uint8Array>;
  truncated: boolean;
}

/**
 * Repositories linked to projects as Seshat sees them through Proxenos,
 * set up by each test (`set` puts files at a new head commit).
 */
export class FakeRepositories extends RepositoryFiles {
  readonly repositories = new Map<string, FakeRepository>();
  /** Set to make listing fail, e.g. Proxenos not answering. */
  failure: RepositoryFilesError | null = null;
  /** Every listing asked for: link and paths. */
  readonly listings: { linkId: string; paths: string[] }[] = [];
  /** Every blob read. */
  readonly reads: string[] = [];

  get configured(): boolean {
    return true;
  }

  /** The link's files at a new head commit (returned). */
  set(
    link: { linkId: string; organizationId: string; projectId: string },
    files: Record<string, string | Uint8Array>,
    options: { fullName?: string; truncated?: boolean } = {},
  ): string {
    const commit = randomBytes(20).toString('hex');
    this.repositories.set(link.linkId, {
      organizationId: link.organizationId,
      projectId: link.projectId,
      fullName: options.fullName ?? 'acme/api',
      commit,
      files: new Map(
        Object.entries(files).map(([path, content]) => [
          path,
          typeof content === 'string'
            ? new TextEncoder().encode(content)
            : content,
        ]),
      ),
      truncated: options.truncated ?? false,
    });
    return commit;
  }

  list(
    organizationId: string,
    projectId: string,
    linkId: string,
    paths: readonly string[],
  ): Promise<RepositoryListing | null> {
    this.listings.push({ linkId, paths: [...paths] });
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    const repository = this.repositories.get(linkId);
    if (
      !repository ||
      repository.organizationId !== organizationId ||
      repository.projectId !== projectId
    ) {
      return Promise.resolve(null);
    }
    return Promise.resolve({
      fullName: repository.fullName,
      commit: repository.commit,
      truncated: repository.truncated,
      // Proxenos filters by paths; the fake leaves it to Seshat (which checks again).
      files: [...repository.files]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([path, bytes]) => ({
          path,
          sha: gitBlobSha(bytes),
          sizeBytes: bytes.byteLength,
          url: `https://github.com/${repository.fullName}/blob/${repository.commit}/${path}`,
        })),
    });
  }

  read(
    organizationId: string,
    projectId: string,
    linkId: string,
    blob: { sha: string; sizeBytes: number },
  ): Promise<Uint8Array> {
    this.reads.push(blob.sha);
    const repository = this.repositories.get(linkId);
    const bytes = [...(repository?.files.values() ?? [])].find(
      (content) => gitBlobSha(content) === blob.sha,
    );
    if (!bytes || repository?.projectId !== projectId) {
      return Promise.reject(
        new DocumentFileError('The file is no longer in the repository', false),
      );
    }
    return Promise.resolve(bytes);
  }
}
