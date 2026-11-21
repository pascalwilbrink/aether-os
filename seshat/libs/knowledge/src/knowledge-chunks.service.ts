import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

import { redactText, Transactional } from '@seshat/core';

import { chunkText } from './chunks.js';
import { KnowledgeChunkEntity } from './knowledge-chunk.entity.js';
import { KnowledgeEmbeddingEntity } from './knowledge-embedding.entity.js';
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

/** A search by meaning: the query's vector, from `model`. */
export interface VectorSearch extends Omit<ChunkSearch, 'query'> {
  vector: number[];
  model: string;
  /** The least cosine similarity a passage needs. */
  minSimilarity: number;
}

/** A passage of an item's current version, to embed. */
export interface PassageText {
  id: string;
  text: string;
}

/**
 * The searchable passages of items' current versions and their vectors,
 * and searching them: with Postgres full-text search (`tsv`, English) and by
 * cosine distance between vectors (pgvector). Text is cleaned of
 * credentials before it's stored (Krepis's patterns; email addresses stay).
 */
@Injectable()
export class KnowledgeChunksService {
  constructor(
    @InjectRepository(KnowledgeChunkEntity)
    private readonly chunks: Repository<KnowledgeChunkEntity>,
    @InjectRepository(KnowledgeEmbeddingEntity)
    private readonly embeddings: Repository<KnowledgeEmbeddingEntity>,
  ) {}

  /**
   * Replaces the item's passages with `text`'s, for its current version;
   * their vectors go with them (the new ones are embedded again).
   */
  @Transactional()
  async replace(item: KnowledgeItemEntity, text: string): Promise<number> {
    await this.embeddings.delete({ itemId: item.id });
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

  /** The passages of an item's version, in order. */
  async passagesOf(itemId: string, version: number): Promise<PassageText[]> {
    return this.chunks.find({
      select: { id: true, text: true },
      where: { itemId, version },
      order: { ordinal: 'ASC' },
    });
  }

  /**
   * Stores the item's passages' vectors from `model`, replacing any it had;
   * a passage replaced meanwhile is skipped.
   */
  @Transactional()
  async storeEmbeddings(
    item: KnowledgeItemEntity,
    model: string,
    vectors: { chunkId: string; vector: number[] }[],
  ): Promise<void> {
    await this.embeddings.delete({ itemId: item.id });
    const now = new Date();
    for (const { chunkId, vector } of vectors) {
      await this.embeddings.query(
        `INSERT INTO knowledge_embeddings
           (chunk_id, item_id, organization_id, project_id, model, dimensions, embedding, created_at)
         SELECT c.id, c.item_id, c.organization_id, c.project_id, $2, $3, $4::vector, $5
           FROM knowledge_chunks c WHERE c.id = $1`,
        [chunkId, model, vector.length, toVector(vector), now],
      );
    }
  }

  /**
   * The best passage of each item by meaning: the nearest passage of its
   * current version to the query's vector (cosine), among vectors of the
   * same model and length, at least `minSimilarity` alike; best first.
   */
  async searchByVector(search: VectorSearch): Promise<ChunkMatch[]> {
    const rows: { item_id: string; text: string; similarity: number }[] =
      await this.chunks.query(
        `SELECT item_id, text, similarity FROM (
           SELECT DISTINCT ON (c.item_id) c.item_id, c.text,
                  1 - (e.embedding <=> $3::vector) AS similarity
             FROM knowledge_embeddings e
             JOIN knowledge_chunks c ON c.id = e.chunk_id
             JOIN knowledge_items i ON i.id = c.item_id AND i.version = c.version
            WHERE e.organization_id = $1
              AND e.project_id = $2
              AND e.model = $4
              AND e.dimensions = $5
              AND i.status = ANY($6)
              AND ($7::text[] IS NULL OR i.type = ANY($7))
            ORDER BY c.item_id, e.embedding <=> $3::vector
         ) best
         WHERE similarity >= $8
         ORDER BY similarity DESC, item_id
         LIMIT $9`,
        [
          search.organizationId,
          search.projectId,
          toVector(search.vector),
          search.model,
          search.vector.length,
          search.statuses,
          search.types?.length ? search.types : null,
          search.minSimilarity,
          search.limit,
        ],
      );
    return rows.map((row) => ({
      itemId: row.item_id,
      text: row.text,
      score: Number(row.similarity),
    }));
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

/** A vector as pgvector reads it: `[0.1,0.2,…]`. */
function toVector(vector: number[]): string {
  if (!vector.every((value) => Number.isFinite(value))) {
    throw new Error('A vector has a value that is not a finite number');
  }
  return `[${vector.join(',')}]`;
}
