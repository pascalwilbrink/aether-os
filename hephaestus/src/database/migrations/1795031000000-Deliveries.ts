import { MigrationInterface, QueryRunner } from 'typeorm';

export class Deliveries1795031000000 implements MigrationInterface {
  name = 'Deliveries1795031000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "delivery_attempts" integer NOT NULL DEFAULT '0'
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks"
            ADD "branch_cleanup_at" TIMESTAMP WITH TIME ZONE
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "branch_cleanup_at"
        `);
    await queryRunner.query(`
            ALTER TABLE "tasks" DROP COLUMN "delivery_attempts"
        `);
  }
}
