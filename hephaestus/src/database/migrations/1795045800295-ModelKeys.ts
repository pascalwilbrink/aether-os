import { MigrationInterface, QueryRunner } from 'typeorm';

export class ModelKeys1795045800295 implements MigrationInterface {
  name = 'ModelKeys1795045800295';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "model_keys" (
                "id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "scope" text NOT NULL,
                "scope_id" uuid NOT NULL,
                "provider" text NOT NULL,
                "hint" text NOT NULL,
                "updated_by" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "ck_model_keys_scope" CHECK (scope IN ('organization', 'agent')),
                CONSTRAINT "PK_7bed3818534fd14655ee1101228" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_model_keys_scope_scope_id_provider" ON "model_keys" ("scope", "scope_id", "provider")
        `);

    // TypeORM doesn't see changed check constraints: an agent's own key.
    await queryRunner.query(`
            ALTER TABLE "model_calls" DROP CONSTRAINT "ck_model_calls_key_source"
        `);
    await queryRunner.query(`
            ALTER TABLE "model_calls"
            ADD CONSTRAINT "ck_model_calls_key_source" CHECK (key_source IN ('agent', 'organization', 'platform'))
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."uq_model_keys_scope_scope_id_provider"
        `);
    await queryRunner.query(`
            DROP TABLE "model_keys"
        `);
  }
}
