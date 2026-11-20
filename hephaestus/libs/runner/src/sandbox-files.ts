import { posix } from 'node:path';

import type { NewArtifact } from '@hephaestus/artifacts';
import type { TaskResponse } from '@hephaestus/tasks';

import { FileStore, FileStoreError } from './file-store.js';
import type { Sandbox } from './sandbox-provisioner.js';

/** Where relative paths start: the sandbox's workspace. */
const WORKSPACE = '/workspace';

/** A file the agent submits from its sandbox (the `submit_file` tool). */
export interface FileSubmission {
  path: string;
  title: string;
  fileName?: string;
  contentType?: string;
  primary?: boolean;
  revises?: string;
}

/** Media types by extension, for files the agent doesn't type. */
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
};

/** A media type Loculus accepts (`type/subtype`, optional parameters). */
const MEDIA_TYPE =
  /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*(; ?[a-zA-Z0-9!#$&^_.+-]+=[a-zA-Z0-9!#$&^_.+-]+)*$/;

/** The media type of `fileName`, by its extension. */
export function contentTypeOf(fileName: string): string {
  return (
    CONTENT_TYPES[posix.extname(fileName).toLowerCase()] ??
    'application/octet-stream'
  );
}

/** A name Loculus accepts: no directories, no control characters. */
export function fileNameOf(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = posix.basename(name).replace(/[\\\x00-\x1f\x7f]/g, '_');
  return (cleaned || 'file').slice(-255);
}

/**
 * Files an agent produced in its sandbox, kept in Loculus (docs/files.md):
 * Hephaestus reads them out of the sandbox (`exec`, bytes out; the sandbox
 * has no network and never sees a URL or token) and uploads them as the
 * task. What goes wrong is a `FileStoreError` the agent sees.
 */
export class SandboxFiles {
  constructor(
    private readonly store: FileStore,
    /** The largest file kept (`TASK_FILE_MAX_BYTES`). */
    readonly maxBytes: number,
  ) {}

  get available(): boolean {
    return this.store.available;
  }

  async submit(
    sandbox: Sandbox,
    task: TaskResponse,
    taskToken: string,
    submission: FileSubmission,
  ): Promise<NewArtifact> {
    const bytes = await this.read(sandbox, submission.path);
    const fileName = fileNameOf(submission.fileName ?? submission.path);
    const contentType = submission.contentType ?? contentTypeOf(fileName);
    if (!MEDIA_TYPE.test(contentType)) {
      throw new FileStoreError(
        `contentType must be a media type such as text/html, not ${JSON.stringify(contentType)}.`,
      );
    }
    const stored = await this.store.store(task, taskToken, {
      fileName,
      contentType,
      bytes,
    });
    return {
      kind: 'file',
      title: submission.title,
      primary: submission.primary,
      revisionOf: submission.revises,
      ...stored,
    };
  }

  /** The file's bytes; a missing, special or too large file is refused. */
  private async read(sandbox: Sandbox, path: string): Promise<Buffer> {
    if (!sandbox.exec) {
      throw new FileStoreError('Files can’t be read from this sandbox.');
    }
    const absolute = posix.resolve(WORKSPACE, path);
    // `head` reads one byte past the limit, so a larger file shows.
    const result = await sandbox.exec(
      [
        'sh',
        '-c',
        '[ -f "$1" ] || { echo "not a file" >&2; exit 3; }; head -c "$2" -- "$1"',
        'sh',
        absolute,
        String(this.maxBytes + 1),
      ],
      { timeoutMs: 60_000 },
    );
    if (result.exitCode !== 0) {
      throw new FileStoreError(
        result.exitCode === 3
          ? `${absolute} is not a file in your sandbox.`
          : `${absolute} could not be read: ${result.stderr.trim() || `exit code ${result.exitCode}`}`,
      );
    }
    if (result.stdout.length > this.maxBytes) {
      throw new FileStoreError(
        `${absolute} is larger than ${this.maxBytes} bytes, the most a file artifact can be.`,
      );
    }
    return result.stdout;
  }
}
