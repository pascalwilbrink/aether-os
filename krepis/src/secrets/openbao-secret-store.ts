import { SecretStore, SecretStoreUnavailableError } from './secret-store.js';

export interface OpenBaoOptions {
  /** OpenBao's address, e.g. `http://localhost:8200`. */
  address: string;
  token: string;
  /** The KV version 2 secrets engine's mount. */
  mount: string;
  timeoutMs?: number;
}

/** Secrets from an OpenBao KV version 2 engine (`GET /v1/<mount>/data/<path>`). */
export class OpenBaoSecretStore extends SecretStore {
  constructor(private readonly options: OpenBaoOptions) {
    super();
  }

  async read(path: string): Promise<Record<string, unknown> | null> {
    const url = `${this.options.address.replace(/\/$/, '')}/v1/${this.options.mount}/data/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { 'x-vault-token': this.options.token },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
      });
    } catch (error) {
      throw new SecretStoreUnavailableError(
        `OpenBao could not be reached: ${String(error)}`,
      );
    }
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new SecretStoreUnavailableError(
        `OpenBao answered ${response.status} reading ${path}`,
      );
    }
    const body = (await response.json()) as {
      data?: { data?: Record<string, unknown> | null };
    };
    return body.data?.data ?? null;
  }
}
