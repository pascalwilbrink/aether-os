import { Inject, Injectable, Logger } from '@nestjs/common';

import type { ApiTypes } from '@seshat/core';

import { Embeddings } from './embeddings.js';
import {
  type ChunkMatch,
  KnowledgeChunksService,
} from './knowledge-chunks.service.js';
import {
  KnowledgeItemsService,
  type KnowledgeScope,
} from './knowledge-items.service.js';
import {
  KNOWLEDGE_OPTIONS,
  type KnowledgeOptions,
} from './knowledge.options.js';

const DEFAULT_LIMIT = 10;
/** The longest passage a result shows. */
const PASSAGE_CHARS = 1000;
/** Candidates each way, before they're ranked together. */
const CANDIDATES = 50;
/** Reciprocal rank fusion's constant: how much the top ranks count over the rest. */
const RRF_K = 60;
/** How long a search waits for its query's embedding before going on by keyword. */
const QUERY_EMBEDDING_TIMEOUT_MS = 5000;

type MatchedBy = ApiTypes.KnowledgeSearchResult['matchedBy'][number];

/**
 * Searching a project's knowledge, with its department's, or a
 * department's (../../../../docs/knowledge.md, Search):
 * by keywords (Postgres full-text) and by meaning (the query's embedding,
 * through Pylon, against the passages'), each item ranked by both with
 * reciprocal rank fusion. The best passage of each item, best first.
 * Accepted items only, unless proposed ones are asked for; superseded,
 * retired and rejected ones never come back. Without the query's vector,
 * by keyword only.
 */
@Injectable()
export class KnowledgeSearchService {
  private readonly logger = new Logger(KnowledgeSearchService.name);

  constructor(
    private readonly chunks: KnowledgeChunksService,
    private readonly items: KnowledgeItemsService,
    private readonly embeddings: Embeddings,
    @Inject(KNOWLEDGE_OPTIONS) private readonly options: KnowledgeOptions,
  ) {}

  /**
   * A project's knowledge and its department's, or a department's own. By
   * meaning only a project's items (only theirs are embedded); a
   * department's own search is by keywords.
   */
  async search(
    knowledge: KnowledgeScope,
    request: ApiTypes.SearchKnowledgeRequest,
  ): Promise<ApiTypes.KnowledgeSearchResponse> {
    const { organizationId, projectId, departmentId } = knowledge;
    const scope = {
      organizationId,
      statuses: request.includeProposed
        ? ['accepted', 'proposed']
        : ['accepted'],
      types: request.types,
      limit: CANDIDATES,
    };
    const [keyword, semantic] = await Promise.all([
      this.chunks.search({
        ...scope,
        projectId,
        departmentId,
        query: request.query,
      }),
      projectId === null
        ? Promise.resolve(null)
        : this.searchByMeaning({ ...scope, projectId }, request.query),
    ]);
    const ranked = fuse(
      { keyword, semantic: semantic ?? [] },
      request.limit ?? DEFAULT_LIMIT,
    );
    const items = new Map(
      (
        await this.items.findMany(
          knowledge,
          ranked.map((match) => match.itemId),
        )
      ).map((item) => [item.id, item]),
    );
    return {
      semantic: semantic !== null,
      results: ranked.flatMap((match) => {
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
                matchedBy: match.matchedBy,
              },
            ]
          : [];
      }),
    };
  }

  /** Matches by meaning; null when the query couldn't be embedded. */
  private async searchByMeaning(
    scope: Omit<
      Parameters<KnowledgeChunksService['searchByVector']>[0],
      'vector' | 'model' | 'minSimilarity'
    >,
    query: string,
  ): Promise<ChunkMatch[] | null> {
    const model = this.embeddings.model;
    if (!model) {
      return null;
    }
    let vector: number[];
    try {
      [vector] = await withTimeout(
        this.embeddings.embed(scope.organizationId, scope.projectId, [query]),
        QUERY_EMBEDDING_TIMEOUT_MS,
      );
    } catch (error) {
      this.logger.warn(
        `Searching by keyword only: the query couldn't be embedded (${error instanceof Error ? error.message : String(error)})`,
      );
      return null;
    }
    return this.chunks.searchByVector({
      ...scope,
      vector,
      model,
      minSimilarity: this.options.searchMinSimilarity,
    });
  }
}

interface RankedMatch {
  itemId: string;
  text: string;
  score: number;
  matchedBy: MatchedBy[];
}

/**
 * Reciprocal rank fusion: an item's score is the sum of 1 / (k + rank) over
 * the lists it's in, so items both ways come first and neither list's
 * scores (rank and similarity, not comparable) are mixed. Its passage is
 * the one from the list where it ranks higher (keywords on a tie). Exported
 * for its unit test.
 */
export function fuse(
  lists: Record<MatchedBy, ChunkMatch[]>,
  limit: number,
): RankedMatch[] {
  const byItem = new Map<string, RankedMatch & { bestRank: number }>();
  for (const by of ['keyword', 'semantic'] as const) {
    lists[by].forEach((match, index) => {
      const rank = index + 1;
      const entry = byItem.get(match.itemId);
      if (!entry) {
        byItem.set(match.itemId, {
          itemId: match.itemId,
          text: match.text,
          score: 1 / (RRF_K + rank),
          matchedBy: [by],
          bestRank: rank,
        });
        return;
      }
      entry.score += 1 / (RRF_K + rank);
      entry.matchedBy.push(by);
      if (rank < entry.bestRank) {
        entry.text = match.text;
        entry.bestRank = rank;
      }
    });
  }
  return [...byItem.values()]
    .sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId))
    .slice(0, limit)
    .map(({ itemId, text, score, matchedBy }) => ({
      itemId,
      text,
      score,
      matchedBy,
    }));
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer in ${ms} ms`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
