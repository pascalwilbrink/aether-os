import { MigrationInterface, QueryRunner } from 'typeorm';

/** Resources, their versions, reviews and audit, and the copy of Polis's persons. */
export class KnowledgeResources1795830000000 implements MigrationInterface {
  name = 'KnowledgeResources1795830000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "knowledge_audit" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "resource_id" uuid NOT NULL,
                "version_id" uuid,
                "action" text NOT NULL,
                "actor" jsonb,
                "reason" text,
                "changes" jsonb NOT NULL,
                "occurred_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_knowledge_audit_action" CHECK (
                    action IN (
                        'resource_created',
                        'resource_updated',
                        'scopes_changed',
                        'stewards_changed',
                        'resource_archived',
                        'resource_deleted',
                        'version_created',
                        'version_edited',
                        'version_submitted',
                        'version_withdrawn',
                        'version_approved',
                        'version_rejected',
                        'changes_requested',
                        'version_published',
                        'version_superseded'
                    )
                ),
                CONSTRAINT "PK_34a329e65174e2937aed4dfca3a" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_knowledge_audit_resource_occurred_at_id" ON "knowledge_audit" ("resource_id", "occurred_at", "id")
        `);
    await queryRunner.query(`
            CREATE TABLE "knowledge_resources" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "knowledge_type" text NOT NULL,
                "title" text NOT NULL,
                "description" text,
                "tags" text array NOT NULL,
                "status" text NOT NULL,
                "scopes" jsonb NOT NULL,
                "stewards" jsonb NOT NULL,
                "published_version_id" uuid,
                "open_version_id" uuid,
                "latest_version_number" integer NOT NULL,
                "published_at" TIMESTAMP WITH TIME ZONE,
                "archived_at" TIMESTAMP WITH TIME ZONE,
                "created_by" jsonb NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "version" integer NOT NULL,
                CONSTRAINT "ck_knowledge_resources_status" CHECK (
                    status IN (
                        'draft',
                        'active',
                        'under_review',
                        'expired',
                        'superseded',
                        'archived'
                    )
                ),
                CONSTRAINT "PK_aef183e054c4d5585375df8f90f" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_knowledge_resources_organization_updated_at_id" ON "knowledge_resources" ("organization_id", "updated_at", "id")
        `);
    // The list's filters on scopes and stewards (jsonb containment);
    // not managed by TypeORM (`synchronize: false` on the entity).
    await queryRunner.query(`
            CREATE INDEX "ix_knowledge_resources_scopes" ON "knowledge_resources" USING gin ("scopes" jsonb_path_ops)
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_knowledge_resources_stewards" ON "knowledge_resources" USING gin ("stewards" jsonb_path_ops)
        `);
    await queryRunner.query(`
            CREATE TABLE "knowledge_reviews" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "resource_id" uuid NOT NULL,
                "version_id" uuid NOT NULL,
                "round" integer NOT NULL,
                "state" text NOT NULL,
                "checksum" character(64) NOT NULL,
                "comment" text,
                "requested_by" jsonb NOT NULL,
                "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "closed_at" TIMESTAMP WITH TIME ZONE,
                "decisions" jsonb NOT NULL,
                CONSTRAINT "ck_knowledge_reviews_state" CHECK (
                    state IN (
                        'open',
                        'approved',
                        'rejected',
                        'changes_requested',
                        'withdrawn'
                    )
                ),
                CONSTRAINT "PK_44131495357664b864f86e070df" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_knowledge_reviews_open" ON "knowledge_reviews" ("version_id")
            WHERE state = 'open'
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_knowledge_reviews_version_id_round" ON "knowledge_reviews" ("version_id", "round")
        `);
    await queryRunner.query(`
            CREATE TABLE "knowledge_versions" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "resource_id" uuid NOT NULL,
                "number" integer NOT NULL,
                "state" text NOT NULL,
                "content" text NOT NULL,
                "checksum" character(64) NOT NULL,
                "change_summary" text,
                "based_on_version_id" uuid,
                "authored_by" jsonb NOT NULL,
                "revision" integer NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "submitted_at" TIMESTAMP WITH TIME ZONE,
                "approved_at" TIMESTAMP WITH TIME ZONE,
                "published_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "ck_knowledge_versions_state" CHECK (
                    state IN (
                        'draft',
                        'in_review',
                        'approved',
                        'rejected',
                        'published',
                        'superseded'
                    )
                ),
                CONSTRAINT "PK_eff8c5b812e926b4e6bdc775aa8" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_knowledge_versions_open" ON "knowledge_versions" ("resource_id")
            WHERE state IN ('draft', 'in_review')
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_knowledge_versions_resource_id_number" ON "knowledge_versions" ("resource_id", "number")
        `);
    await queryRunner.query(`
            CREATE TABLE "persons" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "user_id" uuid,
                "status" text NOT NULL,
                "version" integer NOT NULL,
                "received_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_persons_status" CHECK (status IN ('active', 'deleted')),
                CONSTRAINT "PK_74278d8812a049233ce41440ac7" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_persons_organization_id" ON "persons" ("organization_id")
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_knowledge_resources_stewards"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_knowledge_resources_scopes"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_persons_organization_id"
        `);
    await queryRunner.query(`
            DROP TABLE "persons"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_knowledge_versions_resource_id_number"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_knowledge_versions_open"
        `);
    await queryRunner.query(`
            DROP TABLE "knowledge_versions"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_knowledge_reviews_version_id_round"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."uq_knowledge_reviews_open"
        `);
    await queryRunner.query(`
            DROP TABLE "knowledge_reviews"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_knowledge_resources_organization_updated_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "knowledge_resources"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_knowledge_audit_resource_occurred_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "knowledge_audit"
        `);
  }
}
