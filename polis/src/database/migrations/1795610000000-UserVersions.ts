import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The version of each user in Polis's copy (the newest event's
 * `aggregateVersion`), so Pistis's user events apply in order.
 */
export class UserVersions1795610000000 implements MigrationInterface {
  name = 'UserVersions1795610000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "version" integer NOT NULL DEFAULT 1`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "version"`);
  }
}
