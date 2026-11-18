/**
 * Reads secrets by path (OpenBao, ../../CLAUDE.md: secrets live there,
 * never in service databases). Returns null when nothing is stored at the
 * path; throws `SecretStoreUnavailableError` when the store can't answer.
 * Values are never logged.
 */
export abstract class SecretStore {
  abstract read(path: string): Promise<Record<string, unknown> | null>;
}

export class SecretStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretStoreUnavailableError';
  }
}

/** No OpenBao configured (no `mastra` runtime): every read fails. */
export class UnconfiguredSecretStore extends SecretStore {
  read(): Promise<Record<string, unknown> | null> {
    return Promise.reject(
      new SecretStoreUnavailableError('OpenBao is not configured'),
    );
  }
}
