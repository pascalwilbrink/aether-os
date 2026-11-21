import {
  createSeshatHttpClient,
  fetchFailure,
  SeshatApi,
} from '@hephaestus/core';

/** Where a task's knowledge is: its project, read with its own token. */
export interface KnowledgeScope {
  organizationId: string;
  projectId: string;
  token: string;
}

export type KnowledgeSearch = SeshatApi.SearchKnowledgeRequest;
export type KnowledgeSearchResults = SeshatApi.KnowledgeSearchResponse;
export type KnowledgeItem = SeshatApi.KnowledgeItemResponse;
export type KnowledgePassages = SeshatApi.KnowledgePassagePage;
export type KnowledgeProposal = SeshatApi.CreateKnowledgeItemRequest;

/** What Seshat answered instead: the agent sees it as its tool's error. */
export class KnowledgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'KnowledgeError';
  }
}

/**
 * The project's knowledge, for the agents' knowledge tools
 * (../../../../docs/knowledge.md, Search): Seshat's API with the task's own
 * token, so Seshat limits them to the task's project and the token's role
 * (`knowledge:read`; `knowledge:write` to propose, which a task's service
 * account can only do as a proposal). `NoKnowledgeBase` without
 * `SESHAT_URL`: the agent gets no knowledge tools.
 */
export abstract class KnowledgeBase {
  abstract readonly available: boolean;

  abstract search(
    scope: KnowledgeScope,
    request: KnowledgeSearch,
  ): Promise<KnowledgeSearchResults>;

  abstract get(scope: KnowledgeScope, itemId: string): Promise<KnowledgeItem>;

  abstract passages(
    scope: KnowledgeScope,
    itemId: string,
    page: { cursor?: string; limit: number },
  ): Promise<KnowledgePassages>;

  abstract propose(
    scope: KnowledgeScope,
    proposal: KnowledgeProposal,
  ): Promise<KnowledgeItem>;
}

/** No Seshat: no knowledge tools. */
export class NoKnowledgeBase extends KnowledgeBase {
  readonly available = false;

  private none(): Promise<never> {
    return Promise.reject(new KnowledgeError('No Seshat is configured'));
  }

  search = () => this.none();
  get = () => this.none();
  passages = () => this.none();
  propose = () => this.none();
}

/** Seshat's API, with the generated client. */
export class HttpKnowledgeBase extends KnowledgeBase {
  readonly available = true;

  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 15_000,
  ) {
    super();
  }

  search(
    scope: KnowledgeScope,
    request: KnowledgeSearch,
  ): Promise<KnowledgeSearchResults> {
    return this.call(scope, (client, path) =>
      SeshatApi.searchKnowledge({ client, path, body: request }),
    );
  }

  get(scope: KnowledgeScope, itemId: string): Promise<KnowledgeItem> {
    return this.call(scope, (client, path) =>
      SeshatApi.getKnowledgeItem({ client, path: { ...path, itemId } }),
    );
  }

  passages(
    scope: KnowledgeScope,
    itemId: string,
    page: { cursor?: string; limit: number },
  ): Promise<KnowledgePassages> {
    return this.call(scope, (client, path) =>
      SeshatApi.listKnowledgeItemPassages({
        client,
        path: { ...path, itemId },
        query: page,
      }),
    );
  }

  propose(
    scope: KnowledgeScope,
    proposal: KnowledgeProposal,
  ): Promise<KnowledgeItem> {
    return this.call(scope, (client, path) =>
      SeshatApi.createKnowledgeItem({ client, path, body: proposal }),
    );
  }

  private async call<T>(
    scope: KnowledgeScope,
    request: (
      client: ReturnType<typeof createSeshatHttpClient>,
      path: { organizationId: string; projectId: string },
    ) => Promise<{ data?: T; error?: unknown; response?: Response }>,
  ): Promise<T> {
    const client = createSeshatHttpClient({
      baseUrl: this.baseUrl,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(this.timeoutMs) }),
      auth: () => scope.token,
    });
    let result: Awaited<ReturnType<typeof request>>;
    try {
      result = await request(client, {
        organizationId: scope.organizationId,
        projectId: scope.projectId,
      });
    } catch (error) {
      throw new KnowledgeError(
        `Seshat could not be reached: ${fetchFailure(error)}`,
      );
    }
    const { data, error, response } = result;
    if (!response) {
      throw new KnowledgeError(
        `Seshat could not be reached: ${fetchFailure(error)}`,
      );
    }
    if (response.ok && data !== undefined) {
      return data;
    }
    const problem = (error ?? {}) as { code?: string; detail?: string };
    throw new KnowledgeError(
      `Seshat answered ${response.status}${problem.code ? ` ${problem.code}` : ''}${problem.detail ? `: ${problem.detail}` : ''}`,
    );
  }
}
