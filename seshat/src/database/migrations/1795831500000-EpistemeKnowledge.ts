import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Episteme's published knowledge: items from Episteme (`source_kind`
 * `episteme`, the resource and version they hold, one current item per
 * resource), and the organization's items (neither project nor
 * department, Episteme's only), so `scope_id` falls back to the
 * organization.
 */
export class EpistemeKnowledge1795831500000 implements MigrationInterface {
  name = 'EpistemeKnowledge1795831500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // TypeORM records the generated column under the database's name.
    const database = (await queryRunner.getCurrentDatabase()) ?? '';
    for (const column of [
      `"episteme_resource_id" uuid`,
      `"episteme_version_id" uuid`,
      `"episteme_version_number" integer`,
      `"episteme_knowledge_type" text`,
      `"episteme_resource_version" integer`,
    ]) {
      await queryRunner.query(`ALTER TABLE "knowledge_items" ADD ${column}`);
    }
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP CONSTRAINT "ck_knowledge_items_source_kind"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD CONSTRAINT "ck_knowledge_items_source_kind" CHECK (source_kind IN ('person', 'task', 'session', 'repository', 'episteme'))
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP CONSTRAINT "ck_knowledge_items_owner"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD CONSTRAINT "ck_knowledge_items_owner" CHECK ((project_id IS NULL OR department_id IS NULL) AND (source_kind = 'episteme' OR project_id IS NOT NULL OR department_id IS NOT NULL))
        `);
    await this.scopeId(
      queryRunner,
      database,
      'COALESCE(project_id, department_id, organization_id)',
    );
    await queryRunner.query(`
            CREATE UNIQUE INDEX "uq_knowledge_items_episteme_resource" ON "knowledge_items" ("episteme_resource_id")
            WHERE episteme_resource_id IS NOT NULL
                AND status <> 'retired'
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const database = (await queryRunner.getCurrentDatabase()) ?? '';
    await queryRunner.query(
      `DELETE FROM "knowledge_items" WHERE source_kind = 'episteme'`,
    );
    await queryRunner.query(`
            DROP INDEX "public"."uq_knowledge_items_episteme_resource"
        `);
    await this.scopeId(
      queryRunner,
      database,
      'COALESCE(project_id, department_id)',
    );
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP CONSTRAINT "ck_knowledge_items_owner"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD CONSTRAINT "ck_knowledge_items_owner" CHECK ((project_id IS NULL) <> (department_id IS NULL))
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items" DROP CONSTRAINT "ck_knowledge_items_source_kind"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD CONSTRAINT "ck_knowledge_items_source_kind" CHECK (source_kind IN ('person', 'task', 'session', 'repository'))
        `);
    for (const column of [
      'episteme_resource_version',
      'episteme_knowledge_type',
      'episteme_version_number',
      'episteme_version_id',
      'episteme_resource_id',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "knowledge_items" DROP COLUMN "${column}"`,
      );
    }
  }

  /** `scope_id` made again from another expression (and its index). */
  private async scopeId(
    queryRunner: QueryRunner,
    database: string,
    expression: string,
  ): Promise<void> {
    await queryRunner.query(`
            DROP INDEX "public"."ix_knowledge_items_scope_created_at_id"
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
        expression,
      ],
    );
    await queryRunner.query(`
            ALTER TABLE "knowledge_items"
            ADD "scope_id" uuid GENERATED ALWAYS AS (${expression}) STORED NOT NULL
        `);
    await queryRunner.query(`
            CREATE INDEX "ix_knowledge_items_scope_created_at_id" ON "knowledge_items" ("scope_id", "created_at", "id")
        `);
  }
}
