import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agents and versions become Hephaestus's copy of Agora's (kept from
 * `agora.events`): each agent records the last Agora event applied. Rows
 * already here count as version 1, as Agora's import starts them.
 */
export class AgentsFromAgora1795190000000 implements MigrationInterface {
  name = 'AgentsFromAgora1795190000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "agents" ADD "version" integer NOT NULL DEFAULT 1`,
    );
    await queryRunner.query(
      `ALTER TABLE "agents" ALTER COLUMN "version" DROP DEFAULT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "agents" DROP COLUMN "version"`);
  }
}
