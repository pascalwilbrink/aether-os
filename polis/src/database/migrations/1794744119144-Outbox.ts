import { MigrationInterface, QueryRunner } from 'typeorm';

export class Outbox1794744119144 implements MigrationInterface {
  name = 'Outbox1794744119144';

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
            ALTER TABLE "organizations"
            ADD "version" integer NOT NULL DEFAULT '1'
        `);
    await queryRunner.query(`
            ALTER TABLE "memberships"
            ADD "version" integer NOT NULL DEFAULT '1'
        `);
    await queryRunner.query(`
            ALTER TABLE "projects"
            ADD "version" integer NOT NULL DEFAULT '1'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "projects" DROP COLUMN "version"
        `);
    await queryRunner.query(`
            ALTER TABLE "memberships" DROP COLUMN "version"
        `);
    await queryRunner.query(`
            ALTER TABLE "organizations" DROP COLUMN "version"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_outbox_unpublished_created_at"
        `);
    await queryRunner.query(`
            DROP TABLE "outbox"
        `);
  }
}
