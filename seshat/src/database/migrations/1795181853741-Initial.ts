import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1795181853741 implements MigrationInterface {
  name = 'Initial1795181853741';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TypeORM records the generated column under the database's name.
    const database = await queryRunner.getCurrentDatabase();
    await queryRunner.query(`
            CREATE TABLE "outbox" (
                "id" uuid NOT NULL,
                "exchange" text NOT NULL,
                "routing_key" text NOT NULL,
                "message" jsonb NOT NULL,
                "headers" jsonb NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "published_at" TIMESTAMP WITH TIME ZONE,
                "attempts" integer NOT NULL,
                "last_error" text,
                CONSTRAINT "PK_340ab539f309f03bdaa14aa7649" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_outbox_unpublished_created_at" ON "outbox" ("created_at", "id")
            WHERE published_at IS NULL
        `);
    await queryRunner.query(
      `
            INSERT INTO "typeorm_metadata"(
                    "database",
                    "schema",
                    "table",
                    "type",
                    "name",
                    "value"
                )
            VALUES ($1, $2, $3, $4, $5, $6)
        `,
      [
        database,
        'public',
        'knowledge_chunks',
        'GENERATED_COLUMN',
        'tsv',
        "to_tsvector('english', text)",
      ],
    );
    await queryRunner.query(`
            CREATE TABLE "knowledge_chunks" (
                "id" uuid NOT NULL,
                "item_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "version" integer NOT NULL,
                "ordinal" integer NOT NULL,
                "text" text NOT NULL,
                "tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED NOT NULL,
                CONSTRAINT "PK_81af684d79d321813c41019a5cd" PRIMARY KEY ("id")
            )
        `);
    // Full-text search (TypeORM can't declare a GIN index).
    await queryRunner.query(`
            CREATE INDEX "ix_knowledge_chunks_tsv" ON "knowledge_chunks" USING GIN ("tsv")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_knowledge_chunks_item_version" ON "knowledge_chunks" ("item_id", "version", "ordinal")
        `);
    await queryRunner.query(`
            CREATE TABLE "knowledge_item_versions" (
                "id" uuid NOT NULL,
                "item_id" uuid NOT NULL,
                "version" integer NOT NULL,
                "title" text NOT NULL,
                "body" text NOT NULL,
                "tags" jsonb NOT NULL,
                "references" jsonb NOT NULL,
                "document" jsonb,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "uq_knowledge_item_versions_item_version" UNIQUE ("item_id", "version"),
                CONSTRAINT "PK_5956ed438d20a7fb9c1b41dcb24" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_knowledge_item_versions_item_version_id" ON "knowledge_item_versions" ("item_id", "version", "id")
        `);
    await queryRunner.query(`
            CREATE TABLE "knowledge_items" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "type" text NOT NULL,
                "title" text NOT NULL,
                "body" text NOT NULL,
                "status" text NOT NULL,
                "version" integer NOT NULL,
                "revision" integer NOT NULL,
                "tags" jsonb NOT NULL,
                "references" jsonb NOT NULL,
                "source_kind" text NOT NULL,
                "source_task_id" uuid,
                "supersedes" uuid,
                "superseded_by" uuid,
                "review_by" date,
                "file_id" uuid,
                "file_name" text,
                "content_type" text,
                "size_bytes" bigint,
                "sha256" text,
                "indexing_status" text,
                "indexing_error" text,
                "chunk_count" integer NOT NULL DEFAULT '0',
                "indexing_attempts" integer NOT NULL DEFAULT '0',
                "next_index_at" TIMESTAMP WITH TIME ZONE,
                "indexed_at" TIMESTAMP WITH TIME ZONE,
                "created_by" text NOT NULL,
                "updated_by" text NOT NULL,
                "accepted_by" text,
                "accepted_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_knowledge_items_indexing_status" CHECK (
                    indexing_status IS NULL
                    OR indexing_status IN ('pending', 'indexed', 'failed', 'unsupported')
                ),
                CONSTRAINT "ck_knowledge_items_source_kind" CHECK (source_kind IN ('person', 'task')),
                CONSTRAINT "ck_knowledge_items_status" CHECK (
                    status IN (
                        'proposed',
                        'accepted',
                        'rejected',
                        'superseded',
                        'retired'
                    )
                ),
                CONSTRAINT "ck_knowledge_items_type" CHECK (
                    type IN (
                        'document',
                        'decision',
                        'fact',
                        'convention',
                        'architecture',
                        'lesson'
                    )
                ),
                CONSTRAINT "PK_4da6043fefe372aa8151664e3b2" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_knowledge_items_indexing" ON "knowledge_items" ("indexing_status", "next_index_at")
            WHERE indexing_status = 'pending'
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_knowledge_items_project_created_at_id" ON "knowledge_items" ("project_id", "created_at", "id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const database = await queryRunner.getCurrentDatabase();
    await queryRunner.query(`
            DROP INDEX "public"."ix_knowledge_items_project_created_at_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_knowledge_items_indexing"
        `);
    await queryRunner.query(`
            DROP TABLE "knowledge_items"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_knowledge_item_versions_item_version_id"
        `);
    await queryRunner.query(`
            DROP TABLE "knowledge_item_versions"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_knowledge_chunks_tsv"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_knowledge_chunks_item_version"
        `);
    await queryRunner.query(`
            DROP TABLE "knowledge_chunks"
        `);
    await queryRunner.query(
      `
            DELETE FROM "typeorm_metadata"
            WHERE "type" = $1
                AND "name" = $2
                AND "database" = $3
                AND "schema" = $4
                AND "table" = $5
        `,
      ['GENERATED_COLUMN', 'tsv', database, 'public', 'knowledge_chunks'],
    );
    await queryRunner.query(`
            DROP INDEX "public"."ix_outbox_unpublished_created_at"
        `);
    await queryRunner.query(`
            DROP TABLE "outbox"
        `);
  }
}
