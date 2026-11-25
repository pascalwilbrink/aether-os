import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A department's knowledge: items (and their passages) belong to a project
 * or a department; `scope_id` is whichever they have, so a project's view
 * (its items and its department's) is one `IN` filter. And Seshat's copy of
 * the department each project is in.
 */
export class DepartmentKnowledge1795580000000 implements MigrationInterface {
  name = 'DepartmentKnowledge1795580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TypeORM records the generated column under the database's name.
    const database = await queryRunner.getCurrentDatabase();
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" ALTER COLUMN "project_id" DROP NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" ADD "department_id" uuid
        `);
    await queryRunner.query(
      `
            INSERT INTO "typeorm_metadata"(
                    "database",
                    "schema",
                    "table",
                    "type",
                    "name",
                    "value"
                )
            VALUES ($1, $2, $3, $4, $5, $6)
        `,
      [
        database,
        'public',
        'knowledge_items',
        'GENERATED_COLUMN',
        'scope_id',
        'COALESCE(project_id, department_id)',
      ],
    );
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD "scope_id" uuid GENERATED ALWAYS AS (COALESCE(project_id, department_id)) STORED NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD CONSTRAINT "ck_knowledge_items_owner" CHECK ((project_id IS NULL) <> (department_id IS NULL))
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_knowledge_items_scope_created_at_id" ON "knowledge_items" ("scope_id", "created_at", "id")
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_chunks" ALTER COLUMN "project_id" DROP NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_chunks" ADD "department_id" uuid
        `);
    await queryRunner.query(`
            CREATE TABLE "project_departments" (
                "project_id" uuid NOT NULL,
                "organization_id" uuid NOT NULL,
                "department_id" uuid,
                "version" integer NOT NULL,
                "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
                CONSTRAINT "PK_3d1cda7b8172292c36fe2879ff2" PRIMARY KEY ("project_id")
            )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // TypeORM records the generated column under the database's name.
    const database = await queryRunner.getCurrentDatabase();
    await queryRunner.query(`
            DROP TABLE "project_departments"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_chunks" DROP COLUMN "department_id"
        `);
    await queryRunner.query(`
            DROP INDEX "public"."ix_knowledge_items_scope_created_at_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP CONSTRAINT "ck_knowledge_items_owner"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP COLUMN "scope_id"
        `);
    await queryRunner.query(
      `
            DELETE FROM "typeorm_metadata"
            WHERE "type" = $1
                AND "name" = $2
                AND "database" = $3
                AND "schema" = $4
                AND "table" = $5
        `,
      ['GENERATED_COLUMN', 'scope_id', database, 'public', 'knowledge_items'],
    );
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP COLUMN "department_id"
        `);
  }
}
