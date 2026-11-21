import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * A passage's vector (pgvector), from the embedding model it names; one per
 * passage, deleted with it (a new version's passages get new ones).
 * Compared only with vectors of the same model.
 */
@Entity({ name: 'knowledge_embeddings' })
@Index('ix_knowledge_embeddings_project_model', ['projectId', 'model'])
export class KnowledgeEmbeddingEntity {
  /** The passage's ID (`knowledge_chunks.id`). */
  @PrimaryColumn({ type: 'uuid' })
  chunkId: string;

  @Column({ type: 'uuid' })
  itemId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  /** `<provider>/<model>`. */
  @Column({ type: 'text' })
  model: string;

  @Column({ type: 'integer' })
  dimensions: number;

  /** Any length: the model decides (`dimensions`). */
  @Column({ type: 'vector', select: false })
  embedding: string;

  @Column({ type: 'timestamptz' })
  createdAt: Date;
}
