import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * A searchable passage of an item's current version: its title and body
 * for a written item, a piece of its text for a document. `tsv` is the
 * passage for Postgres full-text search, kept by Postgres itself.
 */
@Entity({ name: 'knowledge_chunks' })
@Index('ix_knowledge_chunks_item_version', ['itemId', 'version', 'ordinal'])
export class KnowledgeChunkEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ type: 'uuid' })
  itemId: string;

  @Column({ type: 'uuid' })
  organizationId: string;

  @Column({ type: 'uuid' })
  projectId: string;

  /** The item's content version this passage belongs to. */
  @Column({ type: 'integer' })
  version: number;

  @Column({ type: 'integer' })
  ordinal: number;

  @Column({ type: 'text' })
  text: string;

  // A GIN index, made by the migration (TypeORM can't declare its kind).
  @Index('ix_knowledge_chunks_tsv', { synchronize: false })
  @Column({
    type: 'tsvector',
    generatedType: 'STORED',
    asExpression: `to_tsvector('english', text)`,
    select: false,
    insert: false,
    update: false,
  })
  tsv: string;
}
