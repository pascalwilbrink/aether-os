import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repository documents (docs/knowledge.md): the repositories linked to
 * projects whose documents Seshat indexes, each item's repository file,
 * `repository` as a source, and the inbox for Proxenos's events (Seshat's
 * first consumer).
 */
export class RepositoryDocuments1795500000000 implements MigrationInterface {
  name = 'RepositoryDocuments1795500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "inbox" (
                "event_id" uuid NOT NULL,
                "source" text NOT NULL,
                "event_type" text NOT NULL,
                "received_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_9b85eb4cab41c7c6023b1e579d0" PRIMARY KEY ("event_id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "knowledge_repositories" (
                "link_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "full_name" text,
                "paths" jsonb NOT NULL,
                "status" text NOT NULL,
                "commit" text,
                "document_count" integer NOT NULL DEFAULT '0',
                "skipped_count" integer NOT NULL DEFAULT '0',
                "error" text,
                "revision" integer NOT NULL DEFAULT '0',
                "sync_attempts" integer NOT NULL DEFAULT '0',
                "next_sync_at" TIMESTAMP WITH TIME ZONE,
                "synced_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_knowledge_repositories_status" CHECK (status IN ('pending', 'synced', 'failed')),
                CONSTRAINT "PK_1e33a5336d0f8c4262ab94f7dbc" PRIMARY KEY ("link_id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_knowledge_repositories_sync" ON "knowledge_repositories" ("status", "next_sync_at")
            WHERE status = 'pending'
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_knowledge_repositories_project_created_at_link" ON "knowledge_repositories" ("project_id", "created_at", "link_id")
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD "repository_link_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD "repository_full_name" text
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD "repository_path" text
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD "repository_commit" text
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD "repository_blob_sha" text
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD "repository_url" text
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP CONSTRAINT "ck_knowledge_items_source_kind"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD CONSTRAINT "ck_knowledge_items_source_kind" CHECK (source_kind IN ('person', 'task', 'repository'))
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_knowledge_items_repository_path" ON "knowledge_items" ("repository_link_id", "repository_path")
            WHERE repository_link_id IS NOT NULL
                AND status <> 'retired'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."uq_knowledge_items_repository_path"
        `);
    await queryRunner.query(`
            DELETE FROM "knowledge_items" WHERE source_kind = 'repository'
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP CONSTRAINT "ck_knowledge_items_source_kind"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD CONSTRAINT "ck_knowledge_items_source_kind" CHECK (source_kind IN ('person', 'task'))
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP COLUMN "repository_url"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP COLUMN "repository_blob_sha"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP COLUMN "repository_commit"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP COLUMN "repository_path"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP COLUMN "repository_full_name"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP COLUMN "repository_link_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_knowledge_repositories_project_created_at_link"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_knowledge_repositories_sync"
        `);
    await queryRunner.query(`
            DROP TABLE "knowledge_repositories"
        `);
    await queryRunner.query(`
            DROP TABLE "inbox"
        `);
  }
}
