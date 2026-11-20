import { SecretStore, SecretStoreUnavailableError } from '@pylon/core';

/** OpenBao in memory, by path; `down` makes every call fail. */
export class FakeSecretStore extends SecretStore {
  readonly secrets = new Map<string, Record<string, unknown>>();
  down = false;

  read(path: string): Promise<Record<string, unknown> | null> {
    if (this.down) return Promise.reject(this.unavailable());
    return Promise.resolve(this.secrets.get(path) ?? null);
  }

  write(path: string, data: Record<string, unknown>): Promise<void> {
    if (this.down) return Promise.reject(this.unavailable());
    this.secrets.set(path, data);
    return Promise.resolve();
  }

  delete(path: string): Promise<void> {
    if (this.down) return Promise.reject(this.unavailable());
    this.secrets.delete(path);
    return Promise.resolve();
  }

  private unavailable() {
    return new SecretStoreUnavailableError('OpenBao is down', 'unreachable');
  }
}
