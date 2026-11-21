import { createHash } from 'node:crypto';

/** A linked repository's files at its default branch's head. */
export interface RepositoryListing {
  fullName: string;
  /** Empty for an empty repository. */
  commit: string;
  files: { path: string; sha: string; sizeBytes: number; url: string }[];
  truncated: boolean;
}

/** Why a repository couldn't be read: retrying helps or it doesn't. */
export class RepositoryFilesError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/**
 * The files of repositories linked to projects, from Proxenos
 * (`HttpRepositoryFiles`, with Seshat's own token); tests use a fake.
 * `list` is null when the link isn't the project's (unlinked); `read`
 * returns a blob's bytes, checked against its SHA. Both throw
 * `RepositoryFilesError` (`read` a `DocumentFileError`, like Loculus's).
 */
export abstract class RepositoryFiles {
  /** False without Proxenos: repositories are recorded but not read. */
  abstract get configured(): boolean;

  abstract list(
    organizationId: string,
    projectId: string,
    linkId: string,
    paths: readonly string[],
  ): Promise<RepositoryListing | null>;

  abstract read(
    organizationId: string,
    projectId: string,
    linkId: string,
    blob: { sha: string; sizeBytes: number },
  ): Promise<Uint8Array>;
}

/** No Proxenos configured (`PROXENOS_URL`): nothing is read. */
export class NoRepositoryFiles extends RepositoryFiles {
  get configured(): boolean {
    return false;
  }

  list(): Promise<RepositoryListing | null> {
    return Promise.reject(
      new RepositoryFilesError(
        "Proxenos isn't configured (PROXENOS_URL)",
        false,
      ),
    );
  }

  read(): Promise<Uint8Array> {
    return Promise.reject(
      new RepositoryFilesError(
        "Proxenos isn't configured (PROXENOS_URL)",
        false,
      ),
    );
  }
}

/** Git's blob SHA: SHA-1 of `blob <size>\0` and the bytes. */
export function gitBlobSha(bytes: Uint8Array): string {
  return createHash('sha1')
    .update(`blob ${bytes.byteLength}\0`)
    .update(bytes)
    .digest('hex');
}

/**
 * The content type Seshat indexes a repository file as, by its name;
 * null for one it doesn't index (code, images, binaries).
 */
export function repositoryContentType(path: string): string | null {
  const name = path.split('/').pop() ?? path;
  const extension = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase();
  switch (extension) {
    case 'md':
    case 'markdown':
    case 'mdx':
      return 'text/markdown';
    case 'txt':
    case 'text':
    case 'rst':
    case 'adoc':
      return 'text/plain';
    case 'csv':
      return 'text/csv';
    case 'html':
    case 'htm':
      return 'text/html';
    case 'pdf':
      return 'application/pdf';
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    default:
      return null;
  }
}

/** Whether `path` is one of `paths` or below a folder among them. */
export function underAnyPath(path: string, paths: readonly string[]): boolean {
  return paths.some((wanted) =>
    wanted.endsWith('/') ? path.startsWith(wanted) : path === wanted,
  );
}
