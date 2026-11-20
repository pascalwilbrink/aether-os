import { createHash } from 'node:crypto';

import { createLoculusHttpClient, LoculusApi } from '@hephaestus/core';
import type { TaskResponse } from '@hephaestus/tasks';

/** A file kept in Loculus (docs/files.md), in the task's project. */
export interface StoredFile {
  fileId: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
}

export interface FileToStore {
  fileName: string;
  contentType: string;
  bytes: Buffer;
}

/** A file read from Loculus: what the task starts from. */
export interface FetchedFile {
  fileName: string;
  contentType: string;
  bytes: Buffer;
}

/**
 * Keeping or reading a file failed; the message is for the agent (or the
 * execution's error). `retryable` when Loculus or the storage didn't answer.
 */
export class FileStoreError extends Error {
  constructor(
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'FileStoreError';
  }
}

/**
 * Where a task's files are kept: Loculus (`LoculusFileStore`, with the
 * task's own token), or nowhere (`NoFileStore`, without `LOCULUS_URL`).
 */
export abstract class FileStore {
  abstract readonly available: boolean;
  abstract store(
    task: TaskResponse,
    taskToken: string,
    file: FileToStore,
  ): Promise<StoredFile>;

  /** A file of the task's project, available and at most `maxBytes`. */
  abstract fetch(
    task: TaskResponse,
    taskToken: string,
    fileId: string,
    maxBytes: number,
  ): Promise<FetchedFile>;
}

export class NoFileStore extends FileStore {
  readonly available = false;

  store(): Promise<StoredFile> {
    return Promise.reject(
      new FileStoreError('Files can’t be kept here (no Loculus).'),
    );
  }

  fetch(): Promise<FetchedFile> {
    return Promise.reject(
      new FileStoreError('Files can’t be read here (no Loculus).'),
    );
  }
}

/**
 * Loculus over its generated client, as the task (its token, limited to
 * the task's project): declare the file, upload the bytes with the signed
 * `PUT` (the storage checks them against the declaration), complete it.
 */
export class LoculusFileStore extends FileStore {
  readonly available = true;

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 60_000,
  ) {
    super();
  }

  async store(
    task: TaskResponse,
    taskToken: string,
    file: FileToStore,
  ): Promise<StoredFile> {
    const client = createLoculusHttpClient({
      baseUrl: this.baseUrl,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(this.timeoutMs) }),
      auth: () => taskToken,
    });
    const path = {
      organizationId: task.organizationId,
      projectId: task.projectId,
    };
    const sha256 = createHash('sha256').update(file.bytes).digest('hex');

    const created = await this.call(() =>
      LoculusApi.createFile({
        client,
        path,
        body: {
          fileName: file.fileName,
          contentType: file.contentType,
          sizeBytes: file.bytes.length,
          sha256,
        },
      }),
    );
    const { upload } = created;
    let uploaded: Response;
    try {
      uploaded = await fetch(upload.url, {
        method: upload.method,
        headers: upload.headers,
        body: new Uint8Array(file.bytes),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new FileStoreError(
        `The file storage could not be reached: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (!uploaded.ok) {
      throw new FileStoreError(
        `The file storage refused the upload (HTTP ${uploaded.status}).`,
      );
    }
    const completed = await this.call(() =>
      LoculusApi.completeFile({
        client,
        path: { ...path, fileId: created.file.id },
      }),
    );
    return {
      fileId: completed.id,
      fileName: completed.fileName,
      contentType: completed.contentType,
      sizeBytes: completed.sizeBytes,
      sha256: completed.sha256,
    };
  }

  async fetch(
    task: TaskResponse,
    taskToken: string,
    fileId: string,
    maxBytes: number,
  ): Promise<FetchedFile> {
    const client = this.client(taskToken);
    const path = {
      organizationId: task.organizationId,
      projectId: task.projectId,
      fileId,
    };
    const file = await this.call(() => LoculusApi.getFile({ client, path }));
    if (file.status !== 'available') {
      throw new FileStoreError(`File ${fileId} isn't uploaded yet.`);
    }
    if (file.sizeBytes > maxBytes) {
      throw new FileStoreError(
        `File ${file.fileName} is ${file.sizeBytes} bytes; a task's files are at most ${maxBytes}.`,
      );
    }
    const { url } = await this.call(() =>
      LoculusApi.getFileDownload({ client, path }),
    );
    let bytes: Buffer;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw new FileStoreError(
        `The file storage could not be reached: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
      throw new FileStoreError(
        `File ${file.fileName} isn't what Loculus recorded (its SHA-256 differs).`,
      );
    }
    return { fileName: file.fileName, contentType: file.contentType, bytes };
  }

  private client(taskToken: string) {
    return createLoculusHttpClient({
      baseUrl: this.baseUrl,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(this.timeoutMs) }),
      auth: () => taskToken,
    });
  }

  /** Loculus's answer, or what it said as a `FileStoreError`. */
  private async call<T>(
    send: () => Promise<{ data?: T; error?: unknown; response?: Response }>,
  ): Promise<T> {
    let result: Awaited<ReturnType<typeof send>>;
    try {
      result = await send();
    } catch (error) {
      throw new FileStoreError(
        `Loculus could not be reached: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }
    if (result.response?.ok && result.data) {
      return result.data;
    }
    // The generated client answers a network failure without a response.
    if (!result.response) {
      const cause = result.error;
      throw new FileStoreError(
        `Loculus could not be reached: ${cause instanceof Error ? cause.message : String(cause)}`,
        true,
      );
    }
    const problem = result.error as { detail?: string } | undefined;
    const status = result.response.status;
    throw new FileStoreError(
      `Loculus refused the file: ${problem?.detail ?? `HTTP ${status}`}`,
      status >= 500 || status === 429,
    );
  }
}
