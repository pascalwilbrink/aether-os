import { MigrationInterface, QueryRunner } from 'typeorm';

export class Initial1794756941850 implements MigrationInterface {
  name = 'Initial1794756941850';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "users" (
                "id" uuid NOT NULL,
                "display_name" text NOT NULL,
                "email" text,
                "status" text NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "last_sign_in_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "ck_users_status" CHECK (status IN ('active', 'disabled')),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_users_created_at_id" ON "users" ("created_at", "id")
        `);
    await queryRunner.query(`
            CREATE TABLE "user_providers" (
                "id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "provider" text NOT NULL,
                "subject" text NOT NULL,
                "email" text,
                "email_verified" boolean NOT NULL,
                "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                "last_sign_in_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "uq_user_providers_provider_subject" UNIQUE ("provider", "subject"),
                CONSTRAINT "PK_7c253db00c7cac2a44f1f5a5c58" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_user_providers_user_id_created_at_id" ON "user_providers" ("user_id", "created_at", "id")
        `);
    await queryRunner.query(`
            ALTER TABLE "user_providers"
            ADD CONSTRAINT "fk_user_providers_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "user_providers" DROP CONSTRAINT "fk_user_providers_user_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_user_providers_user_id_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "user_providers"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_users_created_at_id"
        `);
    await queryRunner.query(`
            DROP TABLE "users"
        `);
  }
}
