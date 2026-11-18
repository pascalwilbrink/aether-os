import { MigrationInterface, QueryRunner } from 'typeorm';

export class Repositories1795025797701 implements MigrationInterface {
  name = 'Repositories1795025797701';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "executions"
            ADD "repository" jsonb
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "repository_link_id" uuid
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "repository_link_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "executions" DROP COLUMN "repository"
        `);
  }
}
