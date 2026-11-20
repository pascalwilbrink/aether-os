/** What a file is declared as: what its upload is signed for. */
export interface ObjectDeclaration {
  contentType: string;
  sizeBytes: number;
  /** SHA-256 of the bytes, lowercase hex. */
  sha256: string;
}

/** A signed request a client makes to the storage itself. */
export interface SignedRequest {
  url: string;
  /** Headers the client must send with it (they're signed). */
  headers: Record<string, string>;
  expiresAt: Date;
}

/** What the storage holds under a key. */
export interface StoredObject {
  sizeBytes: number;
  /** SHA-256 of the bytes, lowercase hex. */
  sha256: string;
}

/** The storage can't be reached or refused Loculus's own request. */
export class StorageUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageUnavailableError';
  }
}

/**
 * The object store behind Loculus (docs/files.md): S3 or an S3-compatible
 * store in `S3ObjectStorage`, a fake in tests. Bytes never pass through
 * Loculus: clients upload and download with signed requests.
 */
export abstract class ObjectStorage {
  /** A `PUT` that only accepts exactly the declared bytes. */
  abstract signUpload(
    key: string,
    declaration: ObjectDeclaration,
    ttlSeconds: number,
  ): Promise<SignedRequest>;

  /** A `GET` that downloads it as an attachment named `fileName`. */
  abstract signDownload(
    key: string,
    fileName: string,
    ttlSeconds: number,
  ): Promise<SignedRequest>;

  /** The object under `key`, or null when there's none. */
  abstract inspect(key: string): Promise<StoredObject | null>;

  /** Removes it; nothing there is fine. */
  abstract delete(key: string): Promise<void>;
}
