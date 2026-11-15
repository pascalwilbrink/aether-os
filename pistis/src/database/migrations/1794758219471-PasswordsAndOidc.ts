import { MigrationInterface, QueryRunner } from 'typeorm';

export class PasswordsAndOidc1794758219471 implements MigrationInterface {
  name = 'PasswordsAndOidc1794758219471';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            CREATE TABLE "oidc_payloads" (
                "kind" text NOT NULL,
                "id" text NOT NULL,
                "payload" jsonb NOT NULL,
                "grant_id" text,
                "uid" text,
                "user_code" text,
                "expires_at" TIMESTAMP WITH TIME ZONE,
                "consumed_at" TIMESTAMP WITH TIME ZONE,
                CONSTRAINT "PK_b7ab2bce3e613c3241c6e9276f2" PRIMARY KEY ("kind", "id")
            )
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_oidc_payloads_expires_at" ON "oidc_payloads" ("expires_at")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_oidc_payloads_uid" ON "oidc_payloads" ("uid")
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_oidc_payloads_grant_id" ON "oidc_payloads" ("grant_id")
        `);
    await queryRunner.query(`
            CREATE TABLE "password_credentials" (
                "user_provider_id" uuid NOT NULL,
                "password_hash" text NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_e6b553bcd8826fdbe3d91adcb2c" PRIMARY KEY ("user_provider_id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "password_credentials"
            ADD CONSTRAINT "fk_password_credentials_user_provider_id" FOREIGN KEY ("user_provider_id") REFERENCES "user_providers"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "password_credentials" DROP CONSTRAINT "fk_password_credentials_user_provider_id"
        `);
    await queryRunner.query(`
            DROP TABLE "password_credentials"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_oidc_payloads_grant_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_oidc_payloads_uid"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_oidc_payloads_expires_at"
        `);
    await queryRunner.query(`
            DROP TABLE "oidc_payloads"
        `);
  }
}
