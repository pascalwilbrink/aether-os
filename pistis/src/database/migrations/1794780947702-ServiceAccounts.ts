import { MigrationInterface, QueryRunner } from 'typeorm';

export class ServiceAccounts1794780947702 implements MigrationInterface {
  name = 'ServiceAccounts1794780947702';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "service_accounts" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "name" text NOT NULL,
                "description" text NOT NULL,
                "status" text NOT NULL,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_service_accounts_status" CHECK (status IN ('active', 'disabled')),
                CONSTRAINT "PK_e2fb216fdc1db94c5e4da7d88fa" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_service_accounts_organization_id_created_at_id" ON "service_accounts" ("organization_id", "created_at", "id")
        `);
    await queryRunner.query(`
            CREATE TABLE "api_keys" (
                "id" uuid NOT NULL,
                "service_account_id" uuid NOT NULL,
                "name" text NOT NULL,
                "prefix" text NOT NULL,
                "key_hash" text NOT NULL,
                "expires_at" TIMESTAMP WITH TIME ZONE,
                "last_used_at" TIMESTAMP WITH TIME ZONE,
                "created_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "uq_api_keys_key_hash" UNIQUE ("key_hash"),
                CONSTRAINT "PK_5c8a79801b44bd27b79228e1dad" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_api_keys_service_account_id_created_at_id" ON "api_keys" ("service_account_id", "created_at", "id")
        `);
    await queryRunner.query(`
            ALTER TABLE "api_keys"
            ADD CONSTRAINT "fk_api_keys_service_account_id" FOREIGN KEY ("service_account_id") REFERENCES "service_accounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "api_keys" DROP CONSTRAINT "fk_api_keys_service_account_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_api_keys_service_account_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "api_keys"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_service_accounts_organization_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "service_accounts"
        `);
  }
}
