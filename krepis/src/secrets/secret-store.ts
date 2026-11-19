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

/**
 * Why the store can't answer, for operators: no store configured, the store
 * refused the caller's credentials (401/403), or anything else (down,
 * timing out, an unexpected answer).
 */
export type SecretStoreUnavailableReason =
  'not-configured' | 'refused' | 'unreachable';

export class SecretStoreUnavailableError extends Error {
  constructor(
    message: string,
    readonly reason: SecretStoreUnavailableReason = 'unreachable',
  ) {
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
      new SecretStoreUnavailableError(
        'OpenBao is not configured',
        'not-configured',
      ),
    );
  }
}
