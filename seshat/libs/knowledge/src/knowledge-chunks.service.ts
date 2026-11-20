import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import { redactText, Transactional } from '@seshat/core';

import { chunkText } from './chunks.js';
import { KnowledgeChunkEntity } from './knowledge-chunk.entity.js';
import type { KnowledgeItemEntity } from './knowledge-item.entity.js';

/** One passage that matched a search, with its item. */
export interface ChunkMatch {
  itemId: string;
  text: string;
  score: number;
}

export interface ChunkSearch {
  organizationId: string;
  projectId: string;
  query: string;
  statuses: string[];
  types?: string[];
  limit: number;
}

/**
 * The searchable passages of items' current versions, and searching them
 * with Postgres full-text search (`tsv`, English). Text is cleaned of
 * credentials before it's stored (Krepis's patterns; email addresses stay).
 */
@Injectable()
export class KnowledgeChunksService {
  constructor(
    @InjectRepository(KnowledgeChunkEntity)
    private readonly chunks: Repository<KnowledgeChunkEntity>,
  ) {}

  /** Replaces the item's passages with `text`'s, for its current version. */
  @Transactional()
  async replace(item: KnowledgeItemEntity, text: string): Promise<number> {
    await this.chunks.delete({ itemId: item.id });
    // The title leads the first passage, so it's searchable and shown.
    const [first = '', ...rest] = chunkText(
      redactText(text, { keepEmails: true }),
    );
    const pieces = [
      [searchableTitle(item.title, item.fileName), first]
        .filter(Boolean)
        .join('\n\n'),
      ...rest,
    ];
    await this.chunks.insert(
      pieces.map((piece, ordinal) =>
        Object.assign(new KnowledgeChunkEntity(), {
          id: uuidv7(),
          itemId: item.id,
          organizationId: item.organizationId,
          projectId: item.projectId,
          version: item.version,
          ordinal,
          text: piece,
        }),
      ),
    );
    return pieces.length;
  }

  /**
   * The best passage of each matching item, best item first: the item's
   * status and type must be among those asked for, and only its current
   * version counts.
   */
  async search(search: ChunkSearch): Promise<ChunkMatch[]> {
    const rows: { item_id: string; text: string; score: number }[] =
      await this.chunks.query(
        `SELECT DISTINCT ON (c.item_id) c.item_id, c.text,
                ts_rank_cd(c.tsv, q) AS score
           FROM knowledge_chunks c
           JOIN knowledge_items i ON i.id = c.item_id AND i.version = c.version
           CROSS JOIN websearch_to_tsquery('english', $3) q
          WHERE c.organization_id = $1
            AND c.project_id = $2
            AND c.tsv @@ q
            AND i.status = ANY($4)
            AND ($5::text[] IS NULL OR i.type = ANY($5))
          ORDER BY c.item_id, score DESC`,
        [
          search.organizationId,
          search.projectId,
          search.query,
          search.statuses,
          search.types?.length ? search.types : null,
        ],
      );
    return rows
      .map((row) => ({
        itemId: row.item_id,
        text: row.text,
        score: Number(row.score),
      }))
      .sort((a, b) => b.score - a.score || a.itemId.localeCompare(b.itemId))
      .slice(0, search.limit);
  }
}

/**
 * A title for full-text search. A document's title is often its file name,
 * which Postgres would read as one token (`overview.pdf`): then its
 * extension is dropped and `_` and `-` become spaces, so its words are found.
 */
export function searchableTitle(
  title: string,
  fileName: string | null = null,
): string {
  if (title !== fileName) {
    return title;
  }
  return title
    .replace(/\.[a-z0-9]{1,8}$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}
