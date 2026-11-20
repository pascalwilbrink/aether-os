import { MigrationInterface, QueryRunner } from 'typeorm';

/** Ollama's settings: its server's URL, and a key that may be absent. */
export class OllamaModelKeys1795130000000 implements MigrationInterface {
  name = 'OllamaModelKeys1795130000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "model_keys" ALTER COLUMN "hint" DROP NOT NULL
        `);
    await queryRunner.query(`
            ALTER TABLE "model_keys" ADD "base_url" text
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
            ALTER TABLE "model_keys" DROP COLUMN "base_url"
        `);
  }
}
