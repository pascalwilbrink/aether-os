/** A project's file in Loculus, as Seshat needs it to register a document. */
export interface DocumentFile {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  status: 'pending' | 'available';
}

/** Why a file couldn't be read: retrying helps or it doesn't. */
export class DocumentFileError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * The documents' files, in Loculus (`HttpDocumentFiles`, with Seshat's own
 * token); tests use a fake. `describe` is null for a file the project
 * doesn't have; `read` returns its bytes, checked against its SHA-256.
 */
export abstract class DocumentFiles {
  abstract describe(
    organizationId: string,
    projectId: string,
    fileId: string,
  ): Promise<DocumentFile | null>;

  abstract read(
    organizationId: string,
    projectId: string,
    file: { id: string; sha256: string; sizeBytes: number },
  ): Promise<Uint8Array>;
}
