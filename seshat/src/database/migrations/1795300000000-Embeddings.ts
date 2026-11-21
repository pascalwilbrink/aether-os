import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Embeddings (docs/knowledge.md, step 2): pgvector, a vector per passage,
 * and each item's embedding state (the embedder's queue). Items that
 * already have passages start `pending`, so they're embedded once Pylon is
 * configured.
 */
export class Embeddings1795300000000 implements MigrationInterface {
  name = 'Embeddings1795300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
                ADD "embedding_status" text,
                ADD "embedding_model" text,
                ADD "embedding_attempts" integer NOT NULL DEFAULT '0',
                ADD "next_embed_at" TIMESTAMP WITH TIME ZONE,
                ADD "embedding_error" text,
                ADD "embedded_at" TIMESTAMP WITH TIME ZONE
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD CONSTRAINT "ck_knowledge_items_embedding_status" CHECK (
                    embedding_status IS NULL
                    OR embedding_status IN ('pending', 'embedded')
                )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_knowledge_items_embedding" ON "knowledge_items" ("embedding_status", "next_embed_at")
            WHERE embedding_status = 'pending'
        `);
    await queryRunner.query(`
            UPDATE "knowledge_items" SET "embedding_status" = 'pending' WHERE "chunk_count" > 0
        `);
    await queryRunner.query(`
            CREATE TABLE "knowledge_embeddings" (
                "chunk_id" uuid NOT NULL,
                "item_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "model" text NOT NULL,
                "dimensions" integer NOT NULL,
                "embedding" vector NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_knowledge_embeddings_chunk_id" PRIMARY KEY ("chunk_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_knowledge_embeddings_project_model" ON "knowledge_embeddings" ("project_id", "model")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "knowledge_embeddings"`);
    await queryRunner.query(
      `DROP INDEX "public"."ix_knowledge_items_embedding"`,
    );
    await queryRunner.query(
      `ALTER TABLE "knowledge_items" DROP CONSTRAINT "ck_knowledge_items_embedding_status"`,
    );
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
                DROP COLUMN "embedded_at",
                DROP COLUMN "embedding_error",
                DROP COLUMN "next_embed_at",
                DROP COLUMN "embedding_attempts",
                DROP COLUMN "embedding_model",
                DROP COLUMN "embedding_status"
        `);
  }
}
