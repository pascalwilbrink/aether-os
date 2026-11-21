import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Skills become a copy of Agora's (../../../../docs/skills.md): `revision`
 * is the last event applied, 1 for the rows from before, as Agora's import
 * starts them.
 */
export class SkillsFromAgora1795410000000 implements MigrationInterface {
  name = 'SkillsFromAgora1795410000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "skills" ADD "revision" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "skills" ALTER COLUMN "revision" DROP DEFAULT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "skills" DROP COLUMN "revision"`);
  }
}
