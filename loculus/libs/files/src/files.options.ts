/** Loculus's limits (`FILE_MAX_BYTES`, the URLs' lifetimes). */
export interface FilesOptions {
  maxBytes: number;
  uploadTtlSeconds: number;
  downloadTtlSeconds: number;
}

export const FILES_OPTIONS = Symbol('FILES_OPTIONS');
