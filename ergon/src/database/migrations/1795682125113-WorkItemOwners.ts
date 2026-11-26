import { MigrationInterface, QueryRunner } from 'typeorm';

/** A work item's department and team (Polis), set by the UI. */
export class WorkItemOwners1795682125113 implements MigrationInterface {
  name = 'WorkItemOwners1795682125113';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "work_items"
            ADD "department_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "work_items"
            ADD "team_id" uuid
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "work_items" DROP COLUMN "team_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "work_items" DROP COLUMN "department_id"
        `);
  }
}
