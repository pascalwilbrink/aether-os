import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1795023066097 implements MigrationInterface {
  name = 'Initial1795023066097';

  public async up(queryRunner: QueryRunner): Promise<void> {
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
    await queryRunner.query(`
            CREATE TABLE "connect_requests" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "requested_by" text NOT NULL,
                "return_to" text NOT NULL,
                "state_hash" text NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "used_at" TIMESTAMP WITH TIME ZONE,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "uq_connect_requests_state_hash" UNIQUE ("state_hash"),
                CONSTRAINT "PK_8955a566ca5fc5f8bd5785f9b0a" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "installations" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "provider" text NOT NULL,
                "external_id" text NOT NULL,
                "account_login" text NOT NULL,
                "account_type" text NOT NULL,
                "repository_selection" text NOT NULL,
                "status" text NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "version" integer NOT NULL DEFAULT '1',
                CONSTRAINT "uq_installations_provider_external_id" UNIQUE ("provider", "external_id"),
                CONSTRAINT "ck_installations_status" CHECK (status IN ('active', 'suspended', 'deleted')),
                CONSTRAINT "ck_installations_repository_selection" CHECK (repository_selection IN ('all', 'selected')),
                CONSTRAINT "ck_installations_account_type" CHECK (account_type IN ('Organization', 'User')),
                CONSTRAINT "ck_installations_provider" CHECK (provider IN ('github')),
                CONSTRAINT "PK_21c7fb94d81eca7a66e64bd2b7f" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_installations_organization_id_created_at_id" ON "installations" ("organization_id", "created_at", "id")
        `);
    await queryRunner.query(`
            CREATE TABLE "repositories" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "installation_id" uuid NOT NULL,
                "external_id" text NOT NULL,
                "full_name" text NOT NULL,
                "default_branch" text NOT NULL,
                "private" boolean NOT NULL,
                "status" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "uq_repositories_installation_id_external_id" UNIQUE ("installation_id", "external_id"),
                CONSTRAINT "ck_repositories_status" CHECK (status IN ('available', 'removed')),
                CONSTRAINT "PK_ef0c358c04b4f4d29b8ca68ddff" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_repositories_organization_id_status_full_name_id" ON "repositories" ("organization_id", "status", "full_name", "id")
        `);
    await queryRunner.query(`
            CREATE TABLE "webhook_deliveries" (
                "id" uuid NOT NULL,
                "provider" text NOT NULL,
                "delivery_id" text NOT NULL,
                "event" text NOT NULL,
                "action" text,
                "payload" jsonb NOT NULL,
                "received_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "processed_at" TIMESTAMP WITH TIME ZONE,
                "error" text,
                CONSTRAINT "uq_webhook_deliveries_provider_delivery_id" UNIQUE ("provider", "delivery_id"),
                CONSTRAINT "PK_535dd409947fb6d8fc6dfc0112a" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "repository_links" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "project_id" uuid NOT NULL,
                "repository_id" uuid NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "uq_repository_links_project_id_repository_id" UNIQUE ("project_id", "repository_id"),
                CONSTRAINT "PK_1465fe10d789168fcf64b05f7d7" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_repository_links_repository_id" ON "repository_links" ("repository_id")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_repository_links_organization_id_project_id_created_at_id" ON "repository_links" (
                "organization_id",
                "project_id",
                "created_at",
                "id"
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_repository_links_organization_id_project_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_repository_links_repository_id"
        `);
    await queryRunner.query(`
            DROP TABLE "repository_links"
        `);
    await queryRunner.query(`
            DROP TABLE "webhook_deliveries"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_repositories_organization_id_status_full_name_id"
        `);
    await queryRunner.query(`
            DROP TABLE "repositories"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_installations_organization_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "installations"
        `);
    await queryRunner.query(`
            DROP TABLE "connect_requests"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_outbox_unpublished_created_at"
        `);
    await queryRunner.query(`
            DROP TABLE "outbox"
        `);
  }
}
