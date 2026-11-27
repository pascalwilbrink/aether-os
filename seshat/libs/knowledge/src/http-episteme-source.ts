import { Inject, Injectable } from '@nestjs/common';

import {
  createEpistemeHttpClient,
  EpistemeApi,
  fetchFailure,
  ServiceTokens,
} from '@seshat/core';

import {
  EpistemeSource,
  EpistemeSourceError,
  type EpistemeResourceState,
} from './episteme-source.js';

export const EPISTEME_CLIENT_OPTIONS = Symbol('EPISTEME_CLIENT_OPTIONS');

export interface EpistemeClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

type Result<T> = { data?: T; error?: unknown; response?: Response };

/**
 * `EpistemeSource` over Episteme's API (the client generated from its
 * spec) with Seshat's own token (`platform:read`): the resource, then its
 * published version. A refused token is renewed once; Episteme not
 * answering (5xx, no answer) is retryable, any other refusal isn't.
 */
@Injectable()
export class HttpEpistemeSource extends EpistemeSource {
  private readonly client: ReturnType<typeof createEpistemeHttpClient>;
  private readonly timeoutMs: number;

  constructor(
    @Inject(EPISTEME_CLIENT_OPTIONS) options: EpistemeClientOptions,
    private readonly tokens: ServiceTokens,
  ) {
    super();
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.client = createEpistemeHttpClient({
      baseUrl: options.baseUrl,
      auth: () => tokens.token(),
    });
  }

  get configured(): boolean {
    return true;
  }

  async read(
    organizationId: string,
    resourceId: string,
  ): Promise<EpistemeResourceState> {
    const resource = await this.call(() =>
      EpistemeApi.getKnowledgeResource({
        client: this.client,
        path: { organizationId, resourceId },
        signal: AbortSignal.timeout(this.timeoutMs),
      }),
    );
    if (!resource) {
      return { kind: 'gone' };
    }
    const published = resource.publishedVersion;
    if (!published || resource.status === 'archived') {
      return { kind: 'unpublished', resourceVersion: resource.version };
    }
    const version = await this.call(() =>
      EpistemeApi.getKnowledgeVersion({
        client: this.client,
        path: { organizationId, resourceId, versionId: published.id },
        signal: AbortSignal.timeout(this.timeoutMs),
      }),
    );
    if (!version) {
      return { kind: 'gone' };
    }
    return {
      kind: 'published',
      published: {
        resourceId: resource.id,
        organizationId: resource.organizationId,
        projectId: resource.projectId,
        departmentId: resource.departmentId,
        knowledgeType: resource.knowledgeType,
        title: resource.title,
        tags: resource.tags,
        resourceVersion: resource.version,
        versionId: version.id,
        versionNumber: version.number,
        content: version.content,
      },
    };
  }

  /** The body of a 2xx, null for a 404 (deleted, or not the organization's). */
  private async call<T>(request: () => Promise<Result<T>>): Promise<T | null> {
    let refreshed = false;
    for (let attempt = 1; ; attempt++) {
      let result: Result<T>;
      try {
        result = await request();
      } catch (error) {
        if (attempt < 2) continue;
        throw new EpistemeSourceError(
          `Episteme didn't answer: ${fetchFailure(error)}`,
          true,
        );
      }
      const { data, response } = result;
      if (!response) {
        if (attempt < 2) continue;
        throw new EpistemeSourceError(
          `Episteme didn't answer: ${fetchFailure(result.error)}`,
          true,
        );
      }
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        attempt--;
        this.tokens.invalidate();
        continue;
      }
      if (response.status === 404) {
        return null;
      }
      if (!response.ok || data === undefined) {
        throw new EpistemeSourceError(
          `Episteme answered ${response.status}`,
          response.status >= 500 || response.status === 401,
        );
      }
      return data;
    }
  }
}
