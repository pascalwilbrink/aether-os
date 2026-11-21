import { Inject, Injectable } from '@nestjs/common';

import {
  createProxenosHttpClient,
  fetchFailure,
  ProxenosApi,
  ServiceTokens,
} from '@seshat/core';

import { DocumentFileError } from './document-files.js';
import {
  gitBlobSha,
  RepositoryFiles,
  RepositoryFilesError,
  type RepositoryListing,
} from './repository-files.js';

export const PROXENOS_CLIENT_OPTIONS = Symbol('PROXENOS_CLIENT_OPTIONS');

export interface ProxenosClientOptions {
  baseUrl: string;
  /** Per listing; GitHub answers behind Proxenos, so longer than 5 seconds. */
  timeoutMs?: number;
  /** For a blob's bytes. */
  readTimeoutMs?: number;
}

type Result<T> = { data?: T; error?: unknown; response?: Response };

/**
 * `RepositoryFiles` over Proxenos's API (the client generated from its
 * spec) with Seshat's own token (`platform:read`): a linked repository's
 * files, and a blob's bytes checked against its Git SHA. GitHub's
 * credentials stay in Proxenos. A refused token is renewed once; Proxenos
 * or GitHub not answering (5xx, no answer) is retryable, a link that isn't
 * the project's (404) or a blob that doesn't match isn't.
 */
@Injectable()
export class HttpRepositoryFiles extends RepositoryFiles {
  private readonly client: ReturnType<typeof createProxenosHttpClient>;
  private readonly timeoutMs: number;
  private readonly readTimeoutMs: number;

  constructor(
    @Inject(PROXENOS_CLIENT_OPTIONS) options: ProxenosClientOptions,
    private readonly tokens: ServiceTokens,
  ) {
    super();
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.readTimeoutMs = options.readTimeoutMs ?? 60_000;
    this.client = createProxenosHttpClient({
      baseUrl: options.baseUrl,
      auth: () => tokens.token(),
    });
  }

  get configured(): boolean {
    return true;
  }

  async list(
    organizationId: string,
    projectId: string,
    linkId: string,
    paths: readonly string[],
  ): Promise<RepositoryListing | null> {
    const listing = await this.call(
      () =>
        ProxenosApi.listRepositoryFiles({
          client: this.client,
          path: { organizationId, projectId, linkId },
          query: { path: [...paths] },
          signal: AbortSignal.timeout(this.timeoutMs),
        }),
      (message, retryable) => new RepositoryFilesError(message, retryable),
    );
    return (
      listing && {
        fullName: listing.fullName,
        commit: listing.commit,
        files: listing.files,
        truncated: listing.truncated,
      }
    );
  }

  async read(
    organizationId: string,
    projectId: string,
    linkId: string,
    blob: { sha: string; sizeBytes: number },
  ): Promise<Uint8Array> {
    const data = await this.call(
      () =>
        ProxenosApi.getRepositoryBlob({
          client: this.client,
          path: { organizationId, projectId, linkId, sha: blob.sha },
          parseAs: 'arrayBuffer',
          signal: AbortSignal.timeout(this.readTimeoutMs),
        }) as Promise<Result<ArrayBuffer>>,
      (message, retryable) => new DocumentFileError(message, retryable),
    );
    if (!data) {
      throw new DocumentFileError(
        'The file is no longer in the repository (or the repository is no longer linked)',
        false,
      );
    }
    const bytes = new Uint8Array(data);
    if (bytes.byteLength !== blob.sizeBytes || gitBlobSha(bytes) !== blob.sha) {
      throw new DocumentFileError(
        "The file's bytes don't match its blob SHA",
        false,
      );
    }
    return bytes;
  }

  /** The body of a 2xx, null for a 404 (not the project's, or gone). */
  private async call<T>(
    request: () => Promise<Result<T>>,
    failure: (message: string, retryable: boolean) => Error,
  ): Promise<T | null> {
    let refreshed = false;
    for (let attempt = 1; ; attempt++) {
      let result: Result<T>;
      try {
        result = await request();
      } catch (error) {
        if (attempt < 2) continue;
        throw failure(`Proxenos didn't answer: ${fetchFailure(error)}`, true);
      }
      const { data, response } = result;
      if (!response) {
        if (attempt < 2) continue;
        throw failure(
          `Proxenos didn't answer: ${fetchFailure(result.error)}`,
          true,
        );
      }
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        attempt--;
        this.tokens.invalidate();
        continue;
      }
      if (response.status === 404) {
        return null;
      }
      if (!response.ok || data === undefined) {
        const detail = problemDetail(result.error);
        throw failure(
          `Proxenos answered ${response.status}${detail ? `: ${detail}` : ''}`,
          response.status >= 500 || response.status === 401,
        );
      }
      return data;
    }
  }
}

function problemDetail(error: unknown): string | null {
  if (error && typeof error === 'object' && 'detail' in error) {
    const { detail } = error as { detail?: unknown };
    return typeof detail === 'string' ? detail : null;
  }
  return null;
}
