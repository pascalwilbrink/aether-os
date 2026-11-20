import { DomainError } from '@loculus/core';

/** Over the size Loculus accepts (`FILE_MAX_BYTES`). */
export class FileTooLargeError extends DomainError {
  constructor(sizeBytes: number, maxBytes: number) {
    super(
      `The file is ${sizeBytes} bytes; Loculus accepts at most ${maxBytes}.`,
      'FILE_TOO_LARGE',
    );
  }
}

/** Completing a file whose object isn't there, or isn't what was declared. */
export class FileUploadIncompleteError extends DomainError {
  constructor(fileId: string, why: string) {
    super(
      `File ${fileId} can't be completed: ${why}.`,
      'FILE_UPLOAD_INCOMPLETE',
    );
  }
}

/** Downloading a file that is still pending. */
export class FileNotAvailableError extends DomainError {
  constructor(fileId: string) {
    super(
      `File ${fileId} isn't available yet: its upload hasn't been completed.`,
      'FILE_NOT_AVAILABLE',
    );
  }
}

/** A new upload for a file that's available already. */
export class FileNotPendingError extends DomainError {
  constructor(fileId: string) {
    super(
      `File ${fileId} is uploaded and complete already.`,
      'FILE_NOT_PENDING',
    );
  }
}
