import { createHash, randomUUID } from 'node:crypto';

import {
  type DocumentFile,
  DocumentFileError,
  DocumentFiles,
} from '@seshat/knowledge';

interface StoredFile extends DocumentFile {
  organizationId: string;
  projectId: string;
  bytes: Uint8Array;
}

/** Loculus's files as Seshat sees them, set up by each test. */
export class FakeFiles extends DocumentFiles {
  readonly files = new Map<string, StoredFile>();
  /** Set to make reading fail, e.g. Loculus not answering. */
  failure: DocumentFileError | null = null;
  reads = 0;

  add(
    organizationId: string,
    projectId: string,
    content: string | Uint8Array,
    options: {
      fileName?: string;
      contentType?: string;
      status?: DocumentFile['status'];
    } = {},
  ): string {
    const bytes =
      typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const id = randomUUID();
    this.files.set(id, {
      id,
      organizationId,
      projectId,
      bytes,
      fileName: options.fileName ?? 'notes.md',
      contentType: options.contentType ?? 'text/markdown',
      sizeBytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      status: options.status ?? 'available',
    });
    return id;
  }

  describe(
    organizationId: string,
    projectId: string,
    fileId: string,
  ): Promise<DocumentFile | null> {
    const file = this.files.get(fileId);
    if (
      !file ||
      file.organizationId !== organizationId ||
      file.projectId !== projectId
    ) {
      return Promise.resolve(null);
    }
    const { id, fileName, contentType, sizeBytes, sha256, status } = file;
    return Promise.resolve({
      id,
      fileName,
      contentType,
      sizeBytes,
      sha256,
      status,
    });
  }

  read(
    organizationId: string,
    projectId: string,
    file: { id: string },
  ): Promise<Uint8Array> {
    this.reads += 1;
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    const stored = this.files.get(file.id);
    if (!stored || stored.projectId !== projectId) {
      return Promise.reject(new DocumentFileError('not found', false));
    }
    return Promise.resolve(stored.bytes);
  }
}
