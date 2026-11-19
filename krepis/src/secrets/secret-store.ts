/**
 * Secrets by path (OpenBao, ../../CLAUDE.md: secrets live there, never in
 * service databases). `read` returns null when nothing is stored at the
 * path; every method throws `SecretStoreUnavailableError` when the store
 * can't answer. Values are never logged.
 */
export abstract class SecretStore {
  abstract read(path: string): Promise<Record<string, unknown> | null>;

  /** Stores `data` at `path`, replacing what was there. */
  abstract write(path: string, data: Record<string, unknown>): Promise<void>;

  /** Removes the secret at `path` with all its versions; nothing there is fine. */
  abstract delete(path: string): Promise<void>;
}

export class SecretStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretStoreUnavailableError';
  }
}

/** No OpenBao configured: every call fails. */
export class UnconfiguredSecretStore extends SecretStore {
  read(): Promise<Record<string, unknown> | null> {
    return this.unavailable();
  }

  write(): Promise<void> {
    return this.unavailable();
  }

  delete(): Promise<void> {
    return this.unavailable();
  }

  private unavailable(): Promise<never> {
    return Promise.reject(
      new SecretStoreUnavailableError('OpenBao is not configured'),
    );
  }
}
