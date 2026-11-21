import { ServiceUnavailableException } from '@nestjs/common';

import {
  createSeshatHttpClient,
  fetchFailure,
  SeshatApi,
  type ServiceTokens,
} from '@hephaestus/core';

import { TaskContextInvalidError } from './task.errors.js';

/** A written item's text kept on the task: longer is cut, the rest read with the knowledge tools. */
export const MAX_PINNED_BODY_CHARS = 32 * 1024;

/**
 * A knowledge item pinned on a task (docs/tasks.md, `context`): the version
 * it got, and for a written item its text then, so every execution and
 * retry sees the same. A document's text stays in Seshat (its passages):
 * the agent reads it with the knowledge tools.
 */
export interface PinnedKnowledge {
  kind: 'knowledge';
  itemId: string;
  version: number;
  type: string;
  title: string;
  /** Markdown; empty for a document. */
  body: string;
  /** The body was longer than `MAX_PINNED_BODY_CHARS`. */
  truncated: boolean;
  /** For a document: its file's name. */
  fileName: string | null;
}

/**
 * Pins knowledge items on a new task: reads each from Seshat with
 * Hephaestus's own token (`platform:read`), so tasks from commands and
 * templates pin them too, and keeps the version it got. Only accepted
 * items of the task's project (`TASK_CONTEXT_INVALID`); Seshat not
 * answering is `503`.
 */
export abstract class TaskContextSource {
  abstract pin(
    organizationId: string,
    projectId: string,
    itemIds: readonly string[],
  ): Promise<PinnedKnowledge[]>;
}

/** No `SESHAT_URL`: a task can't pin knowledge. */
export class NoTaskContextSource extends TaskContextSource {
  pin(
    _organizationId: string,
    _projectId: string,
    itemIds: readonly string[],
  ): Promise<PinnedKnowledge[]> {
    if (itemIds.length === 0) return Promise.resolve([]);
    return Promise.reject(
      new TaskContextInvalidError(
        "Project knowledge isn't available here: Hephaestus has no Seshat configured.",
      ),
    );
  }
}

export class SeshatTaskContextSource extends TaskContextSource {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceTokens: ServiceTokens,
    private readonly timeoutMs = 5_000,
  ) {
    super();
  }

  async pin(
    organizationId: string,
    projectId: string,
    itemIds: readonly string[],
  ): Promise<PinnedKnowledge[]> {
    const pinned: PinnedKnowledge[] = [];
    for (const itemId of new Set(itemIds)) {
      pinned.push(pinnedOf(await this.item(organizationId, projectId, itemId)));
    }
    return pinned;
  }

  private async item(
    organizationId: string,
    projectId: string,
    itemId: string,
    renewed = false,
  ): Promise<SeshatApi.KnowledgeItemResponse> {
    let token: string;
    try {
      token = await this.serviceTokens.token();
    } catch (error) {
      throw unavailable(`no token from Pistis (${String(error)})`);
    }
    const client = createSeshatHttpClient({
      baseUrl: this.baseUrl,
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(this.timeoutMs) }),
      auth: () => token,
    });
    let result: Awaited<ReturnType<typeof SeshatApi.getKnowledgeItem>>;
    try {
      result = await SeshatApi.getKnowledgeItem({
        client,
        path: { organizationId, projectId, itemId },
      });
    } catch (error) {
      throw unavailable(fetchFailure(error));
    }
    const status = result.response?.status ?? 0;
    if (result.data && status === 200) {
      const item = result.data;
      if (item.status !== 'accepted') {
        throw new TaskContextInvalidError(
          `Knowledge item ${itemId} is ${item.status}: a task pins accepted knowledge only.`,
        );
      }
      return item;
    }
    if (status === 401 && !renewed) {
      // A stale token of Hephaestus's own: once more with a new one.
      this.serviceTokens.invalidate();
      return this.item(organizationId, projectId, itemId, true);
    }
    if (status === 404) {
      throw new TaskContextInvalidError(
        `Knowledge item ${itemId} isn't in the task's project.`,
      );
    }
    throw unavailable(`HTTP ${status || '?'}`);
  }
}

/** What a task keeps of an item it pins. */
export function pinnedOf(
  item: SeshatApi.KnowledgeItemResponse,
): PinnedKnowledge {
  const truncated = item.body.length > MAX_PINNED_BODY_CHARS;
  return {
    kind: 'knowledge',
    itemId: item.id,
    version: item.version,
    type: item.type,
    title: item.title,
    body: truncated ? item.body.slice(0, MAX_PINNED_BODY_CHARS) : item.body,
    truncated,
    fileName: item.document?.fileName ?? null,
  };
}

const unavailable = (reason: string) =>
  new ServiceUnavailableException(`Seshat is unavailable: ${reason}`);
