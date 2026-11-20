import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import {
  createLoculusHttpClient,
  fetchFailure,
  LoculusApi,
  ServiceTokens,
} from '@seshat/core';

import {
  type DocumentFile,
  DocumentFileError,
  DocumentFiles,
} from './document-files.js';

export const LOCULUS_CLIENT_OPTIONS = Symbol('LOCULUS_CLIENT_OPTIONS');

export interface LoculusClientOptions {
  baseUrl: string;
  /** Per request to Loculus; docs/engineering.md's default is 5 seconds. */
  timeoutMs?: number;
  /** For downloading a document's bytes from the storage. */
  downloadTimeoutMs?: number;
}

/**
 * `DocumentFiles` over Loculus's API (the client generated from its spec)
 * with Seshat's own token (`platform:read`): a file's details, and its
 * bytes through a fresh signed download URL (never stored), checked against
 * its SHA-256. A refused token is renewed once; Loculus or the storage not
 * answering is retryable, a file that isn't there or doesn't match isn't.
 */
@Injectable()
export class HttpDocumentFiles extends DocumentFiles {
  private readonly client: ReturnType<typeof createLoculusHttpClient>;
  private readonly downloadTimeoutMs: number;

  constructor(
    @Inject(LOCULUS_CLIENT_OPTIONS) options: LoculusClientOptions,
    private readonly tokens: ServiceTokens,
  ) {
    super();
    const timeoutMs = options.timeoutMs ?? 5000;
    this.downloadTimeoutMs = options.downloadTimeoutMs ?? 60_000;
    this.client = createLoculusHttpClient({
      baseUrl: options.baseUrl,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) }),
      auth: () => tokens.token(),
    });
  }

  async describe(
    organizationId: string,
    projectId: string,
    fileId: string,
  ): Promise<DocumentFile | null> {
    const file = await this.call(() =>
      LoculusApi.getFile({
        client: this.client,
        path: { organizationId, projectId, fileId },
      }),
    );
    return (
      file && {
        id: file.id,
        fileName: file.fileName,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        status: file.status,
      }
    );
  }

  async read(
    organizationId: string,
    projectId: string,
    file: { id: string; sha256: string; sizeBytes: number },
  ): Promise<Uint8Array> {
    const download = await this.call(() =>
      LoculusApi.getFileDownload({
        client: this.client,
        path: { organizationId, projectId, fileId: file.id },
      }),
    );
    if (!download) {
      throw new DocumentFileError('The file is no longer in Loculus', false);
    }
    let response: Response;
    try {
      response = await fetch(download.url, {
        signal: AbortSignal.timeout(this.downloadTimeoutMs),
      });
    } catch (error) {
      throw new DocumentFileError(
        `The storage didn't answer: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
    if (!response.ok) {
      throw new DocumentFileError(
        `The storage answered ${response.status}`,
        response.status >= 500,
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    if (bytes.byteLength !== file.sizeBytes || sha256 !== file.sha256) {
      throw new DocumentFileError(
        "The file's bytes don't match what Loculus recorded",
        false,
      );
    }
    return bytes;
  }

  /** The body of a 2xx, null for a 404 or 409 (not available). */
  private async call<T>(
    request: () => Promise<{
      data?: T;
      error?: unknown;
      response?: Response;
    }>,
  ): Promise<T | null> {
    let refreshed = false;
    for (let attempt = 1; ; attempt++) {
      let result: Awaited<ReturnType<typeof request>>;
      try {
        result = await request();
      } catch (error) {
        if (attempt < 2) {
          continue;
        }
        throw new DocumentFileError(
          `Loculus didn't answer: ${fetchFailure(error)}`,
          true,
        );
      }
      const { data, response } = result;
      if (!response) {
        if (attempt < 2) {
          continue;
        }
        throw new DocumentFileError(
          `Loculus didn't answer: ${fetchFailure(result.error)}`,
          true,
        );
      }
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        attempt--;
        this.tokens.invalidate();
        continue;
      }
      if (response.status === 404 || response.status === 409) {
        return null;
      }
      if (!response.ok || data === undefined) {
        throw new DocumentFileError(
          `Loculus answered ${response.status}`,
          response.status >= 500 || response.status === 401,
        );
      }
      return data;
    }
  }
}
