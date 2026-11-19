import { SecretStore, SecretStoreUnavailableError } from './secret-store.js';

export interface OpenBaoOptions {
  /** OpenBao's address, e.g. `http://localhost:8200`. */
  address: string;
  token: string;
  /** The KV version 2 secrets engine's mount. */
  mount: string;
  timeoutMs?: number;
}

/**
 * Secrets in an OpenBao KV version 2 engine: read and written at
 * `/v1/<mount>/data/<path>`, deleted with every version at
 * `/v1/<mount>/metadata/<path>`.
 */
export class OpenBaoSecretStore extends SecretStore {
  constructor(private readonly options: OpenBaoOptions) {
    super();
  }

  async read(path: string): Promise<Record<string, unknown> | null> {
    const response = await this.request('GET', 'data', path);
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

  async write(path: string, data: Record<string, unknown>): Promise<void> {
    const response = await this.request('POST', 'data', path, { data });
    if (!response.ok) {
      throw new SecretStoreUnavailableError(
        `OpenBao answered ${response.status} writing ${path}`,
      );
    }
  }

  /** Its metadata, so no earlier version of the secret stays readable. */
  async delete(path: string): Promise<void> {
    const response = await this.request('DELETE', 'metadata', path);
    if (!response.ok && response.status !== 404) {
      throw new SecretStoreUnavailableError(
        `OpenBao answered ${response.status} deleting ${path}`,
      );
    }
  }

  private async request(
    method: string,
    kind: 'data' | 'metadata',
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const url = `${this.options.address.replace(/\/$/, '')}/v1/${this.options.mount}/${kind}/${path
      .split('/')
      .map(encodeURIComponent)
      .join('/')}`;
    try {
      return await fetch(url, {
        method,
        headers: {
          'x-vault-token': this.options.token,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 5000),
      });
    } catch (error) {
      throw new SecretStoreUnavailableError(
        `OpenBao could not be reached: ${String(error)}`,
      );
    }
  }
}
