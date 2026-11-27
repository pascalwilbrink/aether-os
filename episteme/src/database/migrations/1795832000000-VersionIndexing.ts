import { MigrationInterface, QueryRunner } from 'typeorm';

/** Seshat's indexing of each published version (`knowledge-indexing.*`). */
export class VersionIndexing1795832000000 implements MigrationInterface {
  name = 'VersionIndexing1795832000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "knowledge_versions"
            ADD "indexing_status" text
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_versions"
            ADD "indexing_item_id" uuid
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_versions"
            ADD "indexing_chunk_count" integer
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_versions"
            ADD "indexing_error" text
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_versions"
            ADD "indexing_requested_at" TIMESTAMP WITH TIME ZONE
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_versions"
            ADD "indexing_updated_at" TIMESTAMP WITH TIME ZONE
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_versions"
            ADD CONSTRAINT "ck_knowledge_versions_indexing_status" CHECK (
                    indexing_status IS NULL
                    OR indexing_status IN ('pending', 'indexed', 'failed')
                )
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "knowledge_versions" DROP CONSTRAINT "ck_knowledge_versions_indexing_status"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_versions" DROP COLUMN "indexing_updated_at"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_versions" DROP COLUMN "indexing_requested_at"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_versions" DROP COLUMN "indexing_error"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_versions" DROP COLUMN "indexing_chunk_count"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_versions" DROP COLUMN "indexing_item_id"
        `);
    await queryRunner.query(`
            ALTER TABLE "knowledge_versions" DROP COLUMN "indexing_status"
        `);
  }
}
