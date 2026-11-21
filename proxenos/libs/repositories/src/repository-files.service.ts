import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { ApiTypes, Env } from '@proxenos/core';
import { GitHubApp } from '@proxenos/github';
import {
  InstallationsService,
  RepositoryUnavailableError,
} from '@proxenos/installations';

import { RepositoryLinksService } from './repository-links.service.js';

/** The most a blob may have: Seshat reads documents up to 10 MiB. */
export const BLOB_MAX_BYTES = 10 * 1024 * 1024;

/**
 * A linked repository's files at its default branch's head, and their
 * bytes by blob SHA (docs/knowledge.md, Repository documents): Seshat
 * indexes documents with them. Read with a read-only installation token
 * narrowed to the repository; GitHub's credentials never leave Proxenos.
 */
@Injectable()
export class RepositoryFilesService {
  constructor(
    private readonly links: RepositoryLinksService,
    private readonly installations: InstallationsService,
    private readonly github: GitHubApp,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** The files under `paths` (a folder ends in `/`), by path. */
  async list(
    organizationId: string,
    projectId: string,
    linkId: string,
    paths: readonly string[],
  ): Promise<ApiTypes.RepositoryFilesResponse> {
    const { installationId, repository } = await this.resolve(
      organizationId,
      projectId,
      linkId,
    );
    const tree = await this.github.files(
      installationId,
      { id: repository.externalId, fullName: repository.fullName },
      repository.defaultBranch,
    );
    const base = this.config
      .get('GITHUB_URL', { infer: true })
      .replace(/\/$/, '');
    const files = (tree?.files ?? [])
      .filter((file) => underAny(file.path, paths))
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    return {
      fullName: repository.fullName,
      defaultBranch: repository.defaultBranch,
      commit: tree?.commit ?? '',
      files: files.map((file) => ({
        path: file.path,
        sha: file.sha,
        sizeBytes: file.size,
        url: `${base}/${repository.fullName}/blob/${tree!.commit}/${file.path
          .split('/')
          .map(encodeURIComponent)
          .join('/')}`,
      })),
      truncated: tree?.truncated ?? false,
    };
  }

  /** A blob's bytes (404 when the repository has none with that SHA). */
  async blob(
    organizationId: string,
    projectId: string,
    linkId: string,
    sha: string,
  ): Promise<Uint8Array> {
    const { installationId, repository } = await this.resolve(
      organizationId,
      projectId,
      linkId,
    );
    const bytes = await this.github.blob(
      installationId,
      { id: repository.externalId, fullName: repository.fullName },
      sha,
      BLOB_MAX_BYTES,
    );
    if (!bytes) {
      throw new NotFoundException(`${repository.fullName} has no blob ${sha}`);
    }
    return bytes;
  }

  private async resolve(
    organizationId: string,
    projectId: string,
    linkId: string,
  ) {
    const { repository } = await this.links.findById(
      organizationId,
      projectId,
      linkId,
    );
    if (repository.status !== 'available') {
      throw new RepositoryUnavailableError(repository.id);
    }
    const installation = await this.installations.findActive(
      organizationId,
      repository.installationId,
    );
    return { installationId: installation.externalId, repository };
  }
}

/** Whether `path` is one of `paths` or below a folder among them. */
export function underAny(path: string, paths: readonly string[]): boolean {
  return paths.some((wanted) =>
    wanted.endsWith('/') ? path.startsWith(wanted) : path === wanted,
  );
}
