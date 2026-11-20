import { Injectable } from '@nestjs/common';

import type { ApiTypes } from '@seshat/core';

import { KnowledgeChunksService } from './knowledge-chunks.service.js';
import { KnowledgeItemsService } from './knowledge-items.service.js';

const DEFAULT_LIMIT = 10;
/** The longest passage a result shows. */
const PASSAGE_CHARS = 1000;

/**
 * Searching a project's knowledge by its text: the best passage of each
 * matching item, best first. Accepted items only, unless proposed ones are
 * asked for; superseded, retired and rejected ones never come back.
 */
@Injectable()
export class KnowledgeSearchService {
  constructor(
    private readonly chunks: KnowledgeChunksService,
    private readonly items: KnowledgeItemsService,
  ) {}

  async search(
    organizationId: string,
    projectId: string,
    request: ApiTypes.SearchKnowledgeRequest,
  ): Promise<ApiTypes.KnowledgeSearchResponse> {
    const matches = await this.chunks.search({
      organizationId,
      projectId,
      query: request.query,
      statuses: request.includeProposed
        ? ['accepted', 'proposed']
        : ['accepted'],
      types: request.types,
      limit: request.limit ?? DEFAULT_LIMIT,
    });
    const items = new Map(
      (
        await this.items.findMany(
          organizationId,
          projectId,
          matches.map((match) => match.itemId),
        )
      ).map((item) => [item.id, item]),
    );
    return {
      results: matches.flatMap((match) => {
        const item = items.get(match.itemId);
        return item
          ? [
              {
                item,
                passage:
                  match.text.length > PASSAGE_CHARS
                    ? `${match.text.slice(0, PASSAGE_CHARS)}…`
                    : match.text,
                score: match.score,
              },
            ]
          : [];
      }),
    };
  }
}
