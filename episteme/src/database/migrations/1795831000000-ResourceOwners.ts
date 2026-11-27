import { MigrationInterface, QueryRunner } from 'typeorm';

/** A resource's optional owner: a project or a department. */
export class ResourceOwners1795831000000 implements MigrationInterface {
  name = 'ResourceOwners1795831000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "knowledge_resources"
            ADD "project_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_resources"
            ADD "department_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_resources"
            ADD CONSTRAINT "ck_knowledge_resources_owner" CHECK (
                    project_id IS NULL
                    OR department_id IS NULL
                )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "knowledge_resources" DROP CONSTRAINT "ck_knowledge_resources_owner"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_resources" DROP COLUMN "department_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_resources" DROP COLUMN "project_id"
        `);
  }
}
