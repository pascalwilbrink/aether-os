import { MigrationInterface, QueryRunner } from 'typeorm';

export class Tenancy1794755705357 implements MigrationInterface {
  name = 'Tenancy1794755705357';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Organizations and projects now belong to Polis; Hephaestus keeps only
    // their status (organization_states, project_states). Its own copies
    // are dropped outright rather than expanded and contracted over two
    // releases: Hephaestus isn't deployed yet, and Polis has the data.
    await queryRunner.query(`DROP TABLE IF EXISTS "projects"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "organizations"`);
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
            CREATE TABLE "inbox" (
                "event_id" uuid NOT NULL,
                "source" text NOT NULL,
                "event_type" text NOT NULL,
                "received_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_9b85eb4cab41c7c6023b1e579d0" PRIMARY KEY ("event_id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "organization_states" (
                "id" uuid NOT NULL,
                "status" text NOT NULL,
                "version" integer NOT NULL,
                "synced_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_organization_states_status" CHECK (status IN ('active', 'suspended')),
                CONSTRAINT "PK_8ac0da23e5a6c377533a85426bb" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "project_states" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "status" text NOT NULL,
                "version" integer NOT NULL,
                "synced_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_project_states_status" CHECK (status IN ('active', 'archived')),
                CONSTRAINT "PK_01f8f1e6657ad0a64f9abe59e63" PRIMARY KEY ("id")
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP TABLE "project_states"
        `);
    await queryRunner.query(`
            DROP TABLE "organization_states"
        `);
    await queryRunner.query(`
            DROP TABLE "inbox"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_outbox_unpublished_created_at"
        `);
    await queryRunner.query(`
            DROP TABLE "outbox"
        `);
  }
}
