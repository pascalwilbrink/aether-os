import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A model call made through Pylon (`USE_PYLON`, ../docs/pylon.md) records
 * `key_source = 'pylon'`: Pylon picked the key, and its own record says
 * whose. (TypeORM doesn't notice a check constraint's new expression, so
 * this one is written by hand.)
 */
export class PylonKeySource1795210000000 implements MigrationInterface {
  name = 'PylonKeySource1795210000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "model_calls" DROP CONSTRAINT "ck_model_calls_key_source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "model_calls" ADD CONSTRAINT "ck_model_calls_key_source" CHECK (key_source IN ('agent', 'organization', 'platform', 'pylon'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "model_calls" DROP CONSTRAINT "ck_model_calls_key_source"`,
    );
    await queryRunner.query(
      `ALTER TABLE "model_calls" ADD CONSTRAINT "ck_model_calls_key_source" CHECK (key_source IN ('agent', 'organization', 'platform'))`,
    );
  }
}
