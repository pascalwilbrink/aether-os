import { MigrationInterface, QueryRunner } from 'typeorm';

export class WorkspaceWithoutRepository1795001165465 implements MigrationInterface {
  name = 'WorkspaceWithoutRepository1795001165465';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "workspaces"
            ALTER COLUMN "repository" DROP NOT NULL
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "workspaces"
            ALTER COLUMN "repository"
            SET NOT NULL
        `);
  }
}
